# Build Spec for JWT Authorization (end-to-end)

- database schema: `.\database\auth.sql` (`AppUser`, `AppUserRole`, `SysConfig`)
- issuing the token: [`spec/auth/Login.md`](Login.md) — read that first; this file starts where it ends.

## Summary

Everything except login now requires a valid bearer token, and 系統管理 Admin requires the `Admin`
role. The Angular app has a login page, stores the profile in **session** storage, attaches the token
to API calls, guards its routes, and hides 系統管理 from non-Admins.

| Piece | Where |
|-------|-------|
| Key shared by issue + validate | `Services/SigningKeyProvider` |
| Bearer auth + global policy | `Program.cs` |
| Admin-only controllers | `AppUsers`, `AppRoles`, `PublishStatuses` (`[Authorize(Roles = AdminRole.Name)]`) |
| The only anonymous controller | `AuthController` (`[AllowAnonymous]`) |
| Login page | `features/login` |
| Token attach + 401 handling | `core/interceptors/auth.interceptor.ts` |
| Route guards | `core/guards/auth.guard.ts` (`authGuard`, `adminGuard`) |
| Profile / roles | `core/services/auth.service.ts` |

## Decisions

- **Admin is enforced by the API, not just hidden in the menu — decided with the user.** The original
  ask was only to hide 系統管理 for non-Admins. That alone is cosmetic: anyone can type `/app-users`
  or call the endpoint. So the role check lives on the controllers (403), with `adminGuard` keeping
  the UI consistent with it. **The guard and the hidden menu are presentation; `[Authorize]` is the
  boundary.**
- **Everyone lands on `/courses` — decided with the user.** The old default was `app-roles`, which is
  *inside* 系統管理 — a non-Admin would have landed on the area being hidden from them (and, now that
  it is enforced, been bounced straight back out). 課程管理 is visible to all roles.
  - Knock-on: 課程管理 is now `expanded: true`. Only 系統管理 used to be, and it is hidden from
    non-Admins — who would otherwise land on /courses facing a fully collapsed menu.
- **Authenticated-by-default via `FallbackPolicy`**, rather than `[Authorize]` on each controller. A
  fallback policy covers any endpoint that declares no authorization of its own, so a **new
  controller added later is protected by default** — forgetting the attribute fails closed instead of
  silently publishing the table. `AuthController` is the single `[AllowAnonymous]` opt-out.
- **`LookupsController` is authenticated but deliberately not Admin-gated**, even though it serves
  `app-roles` / `publish-statuses` lookups. The Course and FeaturedPromoItem forms need those
  dropdowns; gating it would break those pages for every non-Admin, while it exposes only id/label
  pairs already visible on pages they may open.
- **Session storage, never local** — the profile must die with the tab so a shared machine cannot
  inherit a signed-in session. `auth.service.spec.ts` asserts `localStorage` stays untouched.
- **Roles are read from the token, never stored separately and never fetched.** A stored roles array
  could drift from the token the API actually validates. `AuthService.roles` decodes the `role` claim.

## ⚠️ `MapInboundClaims` defaults to **true** and silently breaks `[Authorize(Roles = ...)]`

The single most expensive trap here, and it fails **without an error**:

`JwtBearerOptions.MapInboundClaims` is `true` by default, which rewrites inbound claim types through
the legacy `JwtSecurityTokenHandler` map — `role` becomes the `ClaimTypes.Role` **schema URI**,
`name` becomes `ClaimTypes.Name`. `RoleClaimType = "role"` then matches nothing, and
`[Authorize(Roles = "Admin")]` returns **403 for every user, including a real Admin**. The token is
valid, the claim is present, the config looks right.

`Program.cs` sets `MapInboundClaims = false`, keeping claims exactly as `JwtTokenService` emitted
them. This was **not** caught by reasoning — `AuthorizationIntegrationTests
.AdminEndpoint_WithAdminRole_Returns200` failed with 403 on the first run, which is why that test is
written the way it is.

Three names must agree, or authorization silently does nothing:
`JwtTokenService.RoleClaimType` (emit) = `TokenValidationParameters.RoleClaimType` (validate) =
`AdminRole.Name` (compare). `AdminRole.Name` is also mirrored by `ADMIN_ROLE` in
`core/models/auth.model.ts`.

## ⚠️ `[AllowAnonymous]` on a **controller** defeats `[Authorize]` on its actions

`AuthController` hosts both the anonymous `login` and the authenticated `profile` endpoint, which
makes the attribute's placement load-bearing:

- **Controller-level `[AllowAnonymous]`** → the authorization middleware asks
  `endpoint.Metadata.GetMetadata<IAllowAnonymous>()`, which finds the class-level attribute
  **regardless of what the action declares**. `[Authorize]` on the action is ignored and anonymous
  callers run the action body.
- **Correct**: `[AllowAnonymous]` on the `Login` action only. Everything else on the controller falls
  back to the global policy, and `[Authorize]` works.

**Measured both ways on this controller** — status code alone does *not* distinguish them, which is
what makes it easy to "verify" wrongly:

| State | Result of an unauthenticated `PUT /api/auth/profile` |
|-------|------------------------------------------------------|
| `[AllowAnonymous]` on the class | `401`, **no** `WWW-Authenticate`, body `{"message":"invalid credentials"}` — the *action ran* and its own missing-`sub` check rejected it |
| `[AllowAnonymous]` on `Login` only | `401` + `WWW-Authenticate: Bearer`, empty body — the pipeline blocked it before the action |

Both are 401. The endpoint was *public* in the first case and only the action's defensive null-check
stopped it reaching the database — a check a future edit could remove. So
`AuthorizationIntegrationTests.Profile_WithoutToken_IsBlockedByThePipeline_NotJustTheActionsOwnCheck`
asserts the **challenge header** and that **the repository was never called**, not merely the status.

## ⚠️ Other things that fail quietly

- **`UseAuthentication()` must precede `UseAuthorization()`** — and did not exist at all before this
  change (`Program.cs` had only `UseAuthorization`). Without it nothing populates
  `HttpContext.User`, so the fallback policy rejects *every* request as anonymous, valid token
  included. It reads as "my token is wrong", not "middleware missing".
- **Role matching is case-sensitive, unlike the database.** Claims compare ordinally; `AppUser`'s
  collation is `Chinese_Taiwan_Stroke_CI_AS`. A RoleId stored as `admin` satisfies neither
  `[Authorize(Roles = "Admin")]` nor the sidebar check — pinned by tests on both sides so the
  asymmetry is a known fact rather than a surprise.
- **🔐 The interceptor attaches the token only to `environment.apiUrl`.** A blanket header would send
  our bearer token to any other host `HttpClient` touches — `environment.publicSiteUrl`
  (uuu.com.tw) is right there in the same file. Covered by a test.
- **The interceptor must not redirect on the login endpoint's own 401.** A wrong password is also a
  401; redirecting would bounce the user off the login page they are already on and swallow the
  error. Covered by a test.
- **⚠️ A 401 from any API call signs the user out** — that is the interceptor's whole job. So an
  endpoint must never use 401 to mean anything except "not signed in". A wrong *current* password on
  `POST /api/auth/change-password` is a **400**, not a 401, or a typo would clear the session and
  throw the user back to /login mid-form. Whenever you reach for `Unauthorized(...)` in a controller,
  check it really means "your session is over" (see `spec/auth/Profile.md`).
- **A 403 must not clear the session.** "Signed in but not allowed" is not "signed out"; logging in
  again would not help. Only 401 signs out.

## Verified against the dev DB (read-only)

The integration tests mock every repository — including the signing key — so they prove the wiring
but not that the **real** key works. A throwaway probe ran the real repositories and the real
`SysConfig` key through the full HTTP pipeline. **SELECTs only; nothing was written.**

| Checked | Result |
|---------|--------|
| No token → protected endpoint | `401`, `WWW-Authenticate: Bearer` |
| Real roles for `miles@uuu.com.tw` | `[Admin, developer, User]` |
| **Real 32-byte key validates an inbound token** | ✅ `200` on `/api/app-users` |
| Non-Admin → `/api/app-users` | `403` |
| Non-Admin → `/api/lookups/partners` | `200` (not over-tightened) |
| Login reachable with no token | yes; wrong password → app-level `401`, no challenge |

`Login.md` had already verified the same key *signs*; this adds that it *validates*.

## Known gaps

- **Logout is client-side only.** It clears session storage; the token stays valid until it expires
  (24h). There is no revocation list, so a copied token outlives the logout.
- **The frontend never verifies the token's signature or expiry** — it only base64-decodes the
  payload to read roles. That is not a weakness (the API re-validates both on every request), but it
  does mean an expired token looks "signed in" until the first API call 401s and the interceptor
  signs the user out. Roles are also whatever the payload claims — again harmless, since the menu is
  not a boundary.
- **No test that the interceptor's token is what the API accepts.** The two sides are tested
  separately (Angular asserts the header; xUnit asserts the API's handling); nothing exercises a real
  browser against a real API. That needs an e2e harness, which this repo has no home for.
- The `PasswordHasher` format question from `spec/auth/AppUser.md` / `Login.md` is unchanged.
