# Build Spec for 個人資料 My Profile

- database schema: `.\database\auth.sql` (`AppUser`)
- auth wiring: [`spec/auth/Authorization.md`](Authorization.md) — read that for the
  `[AllowAnonymous]` placement rule this endpoint depends on.

## Summary

The signed-in user's own account page. Shows **UserId** (read-only), **UserName** (editable) and
**roles** (display only), and lets the user change nothing but their own display name.

The page also hosts **變更密碼 Change Password** (see below).

| Item | Detail |
|------|--------|
| Route | `/profile`, `canActivate: [authGuard]` — every role has one, so no role gate |
| Endpoint | `PUT /api/auth/profile`, `[Authorize]` (not Admin-only) |
| Request | `{ userName }` — **no** userId, **no** roles |
| Success | `200 { userId, userName }` (userName as **stored**, i.e. trimmed) |
| Failure | `400` empty/whitespace/too-long name, `401` no token, `404` account deleted mid-session |
| Shell link | 個人資料 My Profile in the topbar; the username also links there |

## How "only your own UserName" is enforced

Three independent layers, none of which is a runtime check that could be forgotten:

1. **Identity comes from the token.** `User.FindFirstValue("sub")` — never the body. (Raw `sub`,
   because `MapInboundClaims = false`; reading `ClaimTypes.NameIdentifier` would return null here.)
2. **The request DTO has exactly one property.** `UpdateProfileRequest` carries only `UserName`, so a
   body with `userId` / `roleIds` / `isActive` **binds to nothing** and is dropped. Same
   type-system enforcement as `PasswordHash` (see `spec/reference/backend.md`). A test pins the
   property list, and an integration test posts a hostile raw-JSON body over the wire.
3. **The SQL SET list has exactly one column.** `AuthRepository.UpdateUserNameAsync` writes only
   `UserName`. It deliberately does **not** reuse `IAppUserRepository.UpdateAsync`, which also writes
   `IsActive` and *replaces the user's AppUserRole rows* — routing a profile save through that would
   let a user silently wipe their own roles or re-enable a disabled account.

## Decisions

- **No `GET /api/auth/profile`.** UserId and UserName are in the stored profile, roles are claims in
  the token; a fetch would only re-derive what the session already holds, and would give roles a
  second source that could disagree with the token the API enforces.
- **Trim server-side, then echo the stored value.** `[Required]` alone is not enough: with
  `AllowEmptyStrings=false` it rejects `""` but **accepts `"   "`**, which would render as a blank
  user in the shell. The controller trims first and then validates. The client adopts the returned
  value rather than its own input, so the two cannot drift over a stray space.
- **The token is not reissued after a rename**, so its `name` claim goes stale until the next login.
  Harmless: nothing server-side reads it (authorization uses `sub` and `role`) and the UI renders the
  name from the stored profile, which the response refreshes. Reissuing would silently restart the
  24h clock.
- **Not Admin-gated.** Every signed-in user has a profile; the API scopes it to their own token.
- **404 when the update affects 0 rows** — the token outlives the row (valid 24h), so a deleted
  account can still present a valid token.

## Verified against the dev DB (transaction + rollback)

The controller/integration tests mock the repository, so they cannot check SQL semantics — and this
is the sub-system's first **write** endpoint. The exact `UPDATE` was run against real data inside a
transaction and **rolled back**; `miles@uuu.com.tw` was left exactly as found.

| Checked | Result |
|---------|--------|
| **Only UserName changes** | `IsActive`, `PasswordHash` (len 64), `PasswordUpdatedTime` and RoleCount (3) all unchanged |
| Rows affected, real user | `1` → 200 |
| Rows affected, unknown user | `0` → 404 |
| `WHERE UserId = 'MILES@UUU.COM.TW'` | `1` — CI collation, consistent with login |
| After `ROLLBACK` | `Miles Sun` restored |

> ⚠️ Measuring `@@ROWCOUNT` needs care: **any** intervening statement resets it, `PRINT` included. A
> first attempt reported `0` affected rows for an update that had plainly worked. Capture it into a
> variable on the very next line.

---

# 變更密碼 Change Password

`POST /api/auth/change-password`, `[Authorize]`, on the same page. Body
`{ currentPassword, newPassword, confirmNewPassword }` → **`204`**.

| Item | Detail |
|------|--------|
| Checks, in order | current password hashes to the stored value → new password meets the policy → new == confirm |
| On success | `PasswordHash = SHA256(new)`, `PasswordUpdatedTime = DateTime.UtcNow`, then the client signs out |
| Every rejection | **`400` + a message** — never 401 (see below) |
| Policy | length ≥ 8 **and** ≥ 3 of {uppercase, lowercase, digit, symbol} |

## ⚠️ Rejections here must be 400, never 401

A 401 from *any* API call is read by `auth.interceptor.ts` as "your session is over": it clears
session storage and redirects to /login. So answering a **wrong current password** with 401 would
throw the user out of the form and lose their input — over a typo. Every rejection on this endpoint
is a 400 carrying a message. The only 401s on `AuthController` belong to `Login`.

This generalises: **any endpoint that uses 401 to mean something other than "not signed in" will sign
the user out.** See `spec/auth/Authorization.md`.

## The policy

`CMS.API/Data/PasswordPolicy.cs`, mirrored in `core/utils/password-policy.util.ts` so the form can
reject without a round-trip. **The C# copy is the rule; the TypeScript copy is convenience** — the API
re-checks whatever is posted, so drift shows up as a confusing UI, not a hole. Both have matching
test suites (`PasswordPolicyTests.cs` / `password-policy.util.spec.ts`), which are the only thing
keeping them in step.

- **"Symbol" is defined as the complement** of upper/lower/digit, not a punctuation whitelist. The
  four classes are then mutually exclusive and exhaustive — every character counts for exactly one,
  and no unlisted character can be silently unclassifiable. Consequences, both pinned by tests: a
  **space is a symbol**, and a **caseless letter (CJK) is a symbol**.
- **Passwords are never trimmed**, anywhere — client or server. Whitespace is part of a password;
  trimming would let `" x"` authenticate as `"x"`. (Contrast `userName` on the same page, which *is*
  trimmed. Same page, opposite rules — worth not "tidying up".)
- The rejection message is **specified verbatim and bilingual**; `white-space: pre-line` preserves
  its line breaks. Don't paraphrase it.

## Decisions

- **`PasswordUpdatedTime = DateTime.UtcNow` — decided with the user.** The column is a naive SQL
  `datetime` and `spec/auth/AppUser.md` says the frontend appends `'Z'`, i.e. it reads the column as
  UTC; local time would display 8h in the future. ⚠️ **This app had never written the column before**
  (create writes NULL) — the one existing value came from the external login app, so if *that* writes
  local time the column now holds two meanings. Unresolvable from the data; flagged, not guessed.
- **The timestamp is passed from C#, not `GETDATE()`** — so it is unambiguously UTC rather than the
  DB server's local clock, and so a controller test can assert it was set.
- **Success signs the user out and redirects to /login — decided with the user.** Honest limit: that
  clears only *this* browser's copy. The old token cannot be revoked and stays valid for the rest of
  its 24h, so a copy taken elsewhere still works. Forcing logout is partly reassurance.
- **204, no body** — the simplest way to guarantee no hash comes back.
- Order of checks matters: a wrong current password is reported **before** anything about the new
  one, so a failed attempt learns nothing about the policy outcome.

## Verified against the dev DB (transaction + rollback)

⚠️ `PasswordUpdatedTime` is the app's **first non-NULL `datetime` parameter** — create only ever wrote
NULL, so Dapper had never been asked to *send* one. Given this repo's history with `DateOnly` (params
threw `NotSupportedException`; see `CLAUDE.md` 8), that was worth proving rather than assuming. The
real UPDATE ran against real data inside a transaction, then rolled back.

| Checked | Result |
|---------|--------|
| **Dapper `DateTime` → `datetime` param** | accepted, no handler needed (unlike `DateOnly`) |
| `PasswordHash` after update | `== SHA256(new password)` |
| **Only the two columns move** | `UserName`, `IsActive`, RoleCount all unchanged |
| Timestamp round-trip | **0.7 ms** drift — inside `datetime`'s ~3.33 ms resolution, so no timezone shift |
| Rows affected, real user | `1` → 204 |
| Rows affected, unknown user | `0` → 404 |
| After `ROLLBACK` | hash and timestamp restored exactly |

## Known gaps

- **The C# repository method itself is not exercised against the DB** — the SQL statement was, but
  `UpdateUserNameAsync`'s own Dapper mapping is only covered by mocks. Same class of gap as the rest
  of `spec/reference/backend.md`.
- **No optimistic concurrency.** Two sessions renaming the same account race; last write wins. There
  is no rowversion on `AppUser` to check against.
- A rename or password change is **not audited**. `RowAudit` exists in `database/admin.sql` but
  nothing in this app writes to it (see `CLAUDE.md` non-negotiable 1).
- **Changing the password does not invalidate existing tokens.** Nothing can — there is no
  revocation. The old 24h token keeps working everywhere it was copied to.
- **No rate limiting on the current-password check**, so it is an offline-speed oracle for the
  existing password given a valid session. Same standing gap as login (`spec/auth/Login.md`).
- **The new password may equal the old one** — not asked for, so not enforced. Nor is any history,
  expiry, or dictionary check. `appConfig` has an `enforcePasswordPolicy` flag that this app does not
  read; whether the external login app expects more is unverified.
- **Storage is still unsalted SHA-256** (`PasswordHasher`), inherited from the existing login app.
  Complexity rules do not compensate for a fast, unsalted hash — see that class's remarks.
- **The C# and TypeScript policies are kept in step by their two test suites alone.** Nothing
  mechanically enforces that they agree.
