# Implemented features

Read the entry for a feature before modifying it, and the closest structural match before building
a new one. Each entry records only what the code and schema don't already say.

| Feature | Menu | PK shape | Copy it for |
|---------|------|----------|-------------|
| [Partner](#partner) | 課程管理 → 合作廠商 | `smallint IDENTITY` | any plain IDENTITY-PK table |
| [PublishStatus](#publishstatus) | 系統管理 → 發布狀態 | `tinyint`, **not** IDENTITY | user-assigned PKs |
| [CourseGroup](#coursegroup) | 課程管理 → 課程群組 | `smallint IDENTITY` | plain CRUD + cascade hazard |
| [Course](#course) | 課程管理 → 課程 | `int IDENTITY` | FK nav objects, N-N, `date` |
| [AppRole](#approle) | 系統管理 → 角色 | `RoleId` nvarchar | string/non-`pkid` PKs |
| [AppUser](#appuser) | 系統管理 → 使用者 | `UserId` nvarchar | string PK + backend-only column |
| [FeaturedPromoItem](#featuredpromoitem) | 首頁管理 → 上稿作業 | `int IDENTITY` | a **non-list** UI; unique-index reordering |
| [Login API](#login-api) | 登入 (public page) | — (not a table) | reading a secret from `SysConfig`; JWT issuance |
| [JWT authorization](#jwt-authorization) | — (app-wide) | — (not a table) | auth wiring; role-gating a menu + the API |
| [My Profile](#my-profile) | 個人資料 (topbar) | — (not a table) | a self-service write scoped to the caller |

---

## Partner

課程管理 Course → 合作廠商 Partner. Plain CRUD, no FKs. `pkid` is `smallint IDENTITY`; sorted by
`DisplayOrder ASC` (genuinely a global ordering here — unlike Course). The reference implementation
to copy for any IDENTITY-PK table.

## PublishStatus

系統管理 Admin → 發布狀態 PublishStatus. Plain CRUD. Spec: `spec/admin/PublishStatus.md`.

- **Key detail**: `pkid` is `tinyint` and **not** IDENTITY — it is user-assigned, so it is included
  in the INSERT column list and there is no `SCOPE_IDENTITY()`. Don't assume a `pkid` is
  auto-generated; check for `IDENTITY` in the table script.

## CourseGroup

課程管理 Course → 課程群組 CourseGroup. Plain CRUD; `pkid` `smallint IDENTITY` + one required
`Description`. Spec: `spec/course/CourseGroup.md`.

- **Key detail**: `FK_Course_CourseGroup` is `ON DELETE CASCADE`, so deleting a group **silently
  deletes its courses**. The delete confirm warns about this.
  `FK_PartnerCourseGroup_CourseGroup` does not cascade and still blocks via 547 → 409.
- `PartnerCourseGroup` is **not** an N-N junction (it has its own `pkid` IDENTITY plus
  `DisplayOrder`/`Description`) — it's a first-class entity.
- Its deferred 「查看課程」 button can now be wired: `/courses` accepts `?courseGroupPkid=`.

## Course

課程管理 Course → 課程 Course. The reference implementation for **FK nav objects, N-N relations and
`date` columns**. `pkid` `int IDENTITY`; 1,080 rows in the dev DB. Spec: `spec/course/Course.md`.

- **Default sort is `CourseId ASC`, not `DisplayOrder ASC`** — despite the template's "prefer
  DisplayOrder" rule. `Course.DisplayOrder` is *not* a global ordering: 1,080 rows share only 65
  distinct values (ambiguous even within one partner — 243 courses / 21 values), while `CourseId` is
  unique across every row. **Check the data before trusting `DisplayOrder`.**
- Three FKs → `Partner` (NOT NULL), `CourseGroup` (**nullable**), `PublishStatus` (NOT NULL),
  resolved as nav objects via multi-map and rendered as links (all three target pages exist).
- N-N: `CourseInCertification` + `CourseJobCategories` — both true junctions, both
  `ON DELETE CASCADE`, so **no explicit junction cleanup on delete** (unlike `AppRole`/`AppUser`);
  the delete confirm warns they vanish. `CourseFAQ` / `CourseRelatedLink` / `HotCourse` do *not*
  cascade and still block via 547 → 409.
- `CourseRecomm` **is not a child of Course** — it references `CourseId` (varchar) with **no FK
  constraint declared**, so it is not enforced, not part of the 547 path, and out of scope.
- ⚠️ **`PUT /api/courses` is a full replace, and a list row is not a safe body.** `UpdateAsync`
  always runs `ReplaceCertificationsAsync` / `ReplaceJobCategoriesAsync`, but only `GetByIdAsync`
  *populates* `certificationPkids` / `jobCategoryPkids` — `QueryAsync`/`GetAllAsync` leave them
  empty. PUTting a course straight from the list therefore **silently deletes both junctions**:
  204, no exception, and the controller tests mock the repo so nothing fails. Verified live on
  course 42 (`CCNP`): `/query` reports `[]`/`[]` where `/courses/42` reports `[7]`/`[1,15]`, and the
  naive PUT emptied them. 1,048 `CourseJobCategories` rows / 751 courses and 113
  `CourseInCertification` rows / 94 courses are exposed. **Any writer that didn't start from
  `getById` must re-read before it PUTs** — the list's inline editing does. Applies to any future
  bulk/list-based write, here or on another table with the same replace-on-update shape.
- The **list page edits in place** (double-click → blur saves). The reference for inline editing;
  it is *not* PrimeNG's `pEditableColumn` (that opens on single click — see
  `spec/reference/frontend.md`). Read-only columns are 主代碼 / 原廠 / 課程群組. Validation bounds
  come from the SQL types: 定價 is `decimal(9,0)` → integer, but 點數 is `decimal(9,1)` and 387 rows
  are genuinely fractional. Details in `spec/course/Course.md`.
- The only **tabbed** (`p-tabs`) page in the app — see the tabbed-form rules in
  `spec/reference/frontend.md`.
- `/courses` accepts `?courseGroupPkid=` and `?partnerPkid=` (cross-entity navigation; incoming
  params override saved filter state).
- The detail page's 基本資料 card carries a **QR code** to the public site, generated client-side by
  `qrcode` (the app's only non-PrimeNG UI dep; **CommonJS** → listed in `angular.json`'s
  `allowedCommonJsDependencies`). ⚠️ **`CourseId` is not URL-safe** — 15 of 1,080 dev rows hold
  spaces, trailing spaces, parens or CJK, so the URL segment needs `encodeURIComponent`. The QR
  target lives in `environment.publicSiteUrl`, **not** `apiUrl`. Details in
  `spec/course/CourseQRCode.md` — its own spec, since it is a feature with no table.
- ⚠️ `spec/sample1.spec.md` is *also* a Course spec but describes a **fuller system than this DB**:
  its `/copy` endpoint, `ClassSection`/`CourseRecomm` sub-panels, `RowAudit` and print features do
  not exist here. Use it for format only; derive facts from `database/course.sql`. Its QR section
  **is** now built, and the "canvas compositing details" it forward-references now exist in
  `spec/course/CourseQRCode.md`.

## AppRole

系統管理 Admin → 角色 AppRole. CRUD with N-N users via `AppUserRole`.

- **Key detail**: `dbo.AppRole` has both `pkid` (IDENTITY, display only = 主代碼) and `RoleId`
  (nvarchar, the clustered PK / FK target). `RoleId` is the logical key used in routes
  (`/api/app-roles/{id}`, `encodeURIComponent`) and disabled in the edit form; `pkid` is **never**
  the route key. Apply the same reasoning to any table whose PK constraint is on a non-`pkid` column.
- `Description` is `NULL` in the schema, so it's **optional** in code — even though the
  `ui-sample-add.png` mockup shows an asterisk. **UI mockups are style reference only; the schema
  decides required fields.**

## AppUser

系統管理 Admin → 使用者 AppUser. CRUD with N-N roles via `AppUserRole`. Structural twin of AppRole:
`UserId` (nvarchar) is the clustered PK / route key (an email → `encodeURIComponent` is mandatory),
`pkid` int IDENTITY is display-only. Spec: `spec/auth/AppUser.md`.

- **🔐 `PasswordHash` is backend-only, enforced by the type system.** It appears in **no** model —
  not `AppUser`, not `AppUserRequest`, and never in an `AppUserRepository` SELECT list (the [Login
  API](#login-api)'s separate `AuthRepository` is the one place it is read, into a non-`Models/`
  type). With no bindable property a client
  cannot over-post it and it cannot leak; the rule does not depend on a runtime check. On **create**
  it is derived server-side (`PasswordHasher.Hash(SysConfig['appConfig'].defaultPassword)`); on
  **update** it is simply absent from the SET list. **No password field in the UI** in either mode.
- **🔐 `SysConfig.configValue` holds secrets — never expose it.** The `appConfig` JSON contains
  `symmetricSecurityKey` (a JWT signing secret) alongside `defaultPassword`. Hence
  `ISysConfigRepository` returns only the one scalar, there is **no SysConfig
  controller/DTO/lookup**, and the value never appears in a log or exception message.
- **⚠️ `PasswordHasher` uses unsalted SHA-256** (UTF-8 → 64 lowercase hex). Weak for passwords — no
  salt, fast, and every account seeded from the shared default gets an identical hash. It exists
  only to interoperate with the existing login app, and the format is **inferred, not confirmed**
  (the sole existing row is 64 hex chars, but its hash is not SHA256 of the default because that
  user changed their password). Verify against the login app before trusting it; only
  `PasswordHasher.Hash` would change.
- `PasswordUpdatedTime` is **NULL on create** = "still on the default password" (`appConfig` sets
  `enforcePasswordPolicy`). The app's first `datetime` column: `DateTime?`, **no** type handler, but
  the frontend must append `'Z'`.
- **重設密碼為預設值 Reset Password to Default** — Admin-only, on the **edit** form (there is no account
  to reset on 新增, and create already applies the default). `POST /api/auth/reset-password { userId }`
  → 204. `[Authorize(Roles = "Admin")]` → **403** is the boundary; the hidden button and `adminGuard`
  are only the other two layers. Details in `spec/auth/AppUser.md`.
  - **⚠️ It writes `PasswordUpdatedTime = NULL`, not "now"** — re-confirmed with the user against a
    request for "now". NULL is the schema's signal for "still on the default password, never chosen",
    which is exactly true after a reset and matches what create writes. A timestamp would claim the
    user chose the shared default and defeat any force-a-change-at-first-sign-in keyed off NULL. The
    form already renders 「未變更（仍為系統預設密碼）」 for NULL, so it tells the truth for free.
  - Costs of that choice, both recorded: **no audit trail** of who reset what (nothing writes
    `RowAudit`, and the timestamp is deliberately NULL), and the user is **not notified**.
  - The client sends only the UserId; `ResetPasswordRequest` has **no password property**, so an Admin
    cannot set an arbitrary password for someone else. The reply is a bare 204.
- `GET /api/lookups/app-roles` puts **`RoleId`** in `LookupItem.Pkid`, not the surrogate `r.pkid` —
  the junction references `RoleId`. Being a string it needs no `CAST`, so the ORDER BY
  alias-shadowing hazard does not apply.

## FeaturedPromoItem

首頁管理 Home → 上稿作業 FeaturedPromoItem. The first **customized** feature and the reference for a
UI that is *not* a list. `pkid` `int IDENTITY`; 31,715 rows in the dev DB.
Spec: `spec/custom/FeaturedPromoItem/FeaturedPromoItem.md`.

- **The page is a week grid**, not `p-table`: TrainingCenter tabs × a Monday–Sunday week × 3 fixed
  slots per day, Edit opening inline. Consequently there is **no detail page and no `new`/`:id`
  routes** — one route, `/featured-promo-items` — and no drawer, sorting or paging. Copy that shape
  only for another schedule-style page; the list/detail/form triple is still the default.
- **⚠️ `IX_FeaturedPromoItem_UniqueDateLocSlot` (ScheduleOn, TrainingCenter_pkid, Slot) is what makes
  the 「+」/「--」 buttons hard.** A sequential two-step slot update raises **2627**; a
  **single-statement `CASE` swap** succeeds, because the unique index is checked at statement
  completion. Verified both ways on the dev DB. `Slot` is therefore excluded from `UpdateAsync`'s
  SET list — `/move` is the only path that may change it.
- **Slots are not dense.** 15 (day, center) combos have <3 rows and at least one has a *hole* at
  slot 2 (2026-07-30 / center 3 = slots 1 and 3). The grid renders the fixed slot list and matches
  rows into it; iterating the API response would silently slide slot 3 into slot 2's row. `MoveAsync`
  likewise handles an empty target slot as a plain update, with no swap partner.
- **⚠️ TrainingCenter pkids are not contiguous** (1, 2, 3, 5, 54) and **54 (線上研討會) has zero rows**
  — tabs must send the pkid, never the index, and an empty tab is a valid empty week. Its
  `DisplayOrder` *is* a genuine global ordering (5 rows, 5 distinct values), unlike `Course`'s.
- **`Topic`/`Description` are per-item free text, not a copy of the promo's** — only ~6% of rows
  match their `Promotion2.Topic`, uniformly across 2019–2026. The PromoCode lookup sets
  `Promotion_pkid` **only**; it must not seed or overwrite them. `GET /api/lookups/promotions`
  returns all 1,157 promos unfiltered by publish status (live rows reference every status).
- **Nothing FK-references this table**, so DELETE is isolated — no 547 path, no cascade, and the
  confirm text carries no "children will also be deleted" warning (unlike CourseGroup's).
- No `Promotion2` CRUD page exists, so the PromoCode is **not** linked out; recorded in the spec
  instead. The lookup endpoint was still added — a lookup is not a link.

## Login API

`POST /api/auth/login` → `{ userId, userName, accessToken }`, or a generic `401
{"message":"invalid credentials"}`. **Not a CRUD feature**: no table, no menu, no UI. Spec:
`spec/auth/Login.md`. Copy it for anything that reads a secret out of `SysConfig` or issues a token.

- **🔐 The one place `AppUser.PasswordHash` is SELECTed**, hence a separate `IAuthRepository` rather
  than eroding `IAppUserRepository`'s "never in a SELECT list" contract. Its return type
  `UserCredential` lives in `Repositories/`, **not** `Models/` — everything in `Models/` is
  client-reachable. `LoginResponse` has no password property, the same type-system enforcement
  `AppUser` uses.
- **⚠️ `symmetricSecurityKey` is exactly 32 bytes — the HS256 floor, zero headroom.** Shorten that
  `SysConfig` row by one character and *every* login throws at runtime, while mocked-config unit
  tests still pass. `JwtTokenService` length-checks it and fails with a message naming the cause
  (never quoting the key).
- **The three failures are indistinguishable on purpose** — unknown UserId, `IsActive=0` and wrong
  password return byte-identical 401s. Saying which failed makes the endpoint an account-enumeration
  oracle.
- **`IsActive` is checked in the controller, not filtered in SQL.** Behaviourally identical, but the
  SQL form would collapse "inactive" and "unknown" into `null` and put the rule out of reach of a
  mocked-repo test.
- **UserId matching is case-insensitive** (`Chinese_Taiwan_Stroke_CI_AS`, and SQL ignores trailing
  spaces) — decided with the user, consistent with `GetByIdAsync`. So the response and the `sub`
  claim echo the **stored** casing, not what the client posted. The hash compare normalises case for
  the same collation reason: an ordinal compare would silently lock out an uppercase-hash account.
- **`OPENJSON` does not exist here** — the DB runs at **compatibility level 100**. Parse `configValue`
  in C# with `JsonDocument`, as `SysConfigRepository` already did.
- Validation, the login page and role gating are now built — see [JWT authorization](#jwt-authorization).

## JWT authorization

App-wide auth: bearer validation, a global authenticated-by-default policy, the Angular login page,
interceptor, route guards, and the role-gated sidebar. Spec: `spec/auth/Authorization.md`.

- **⚠️ `MapInboundClaims` defaults to `true`, and it silently 403s every Admin.** It rewrites `role`
  into the legacy `ClaimTypes.Role` schema URI, so `RoleClaimType = "role"` matches nothing and
  `[Authorize(Roles = "Admin")]` rejects everyone — token valid, claim present, config apparently
  right, no error anywhere. `Program.cs` sets it `false`. Found by a test failing, not by reading.
- **`UseAuthentication()` must precede `UseAuthorization()`**, and was missing entirely before this
  change. Without it `HttpContext.User` is never populated and the fallback policy 401s *everything*.
- **Authenticated-by-default via `FallbackPolicy`**, so a controller added later without `[Authorize]`
  fails closed rather than silently publishing its table. `AuthController` is the only
  `[AllowAnonymous]`.
- **Admin gating is enforced by the API** (`[Authorize(Roles = AdminRole.Name)]` on AppUsers /
  AppRoles / PublishStatuses → 403). The hidden sidebar group and `adminGuard` are presentation only —
  a hidden menu stops nobody typing the URL. `LookupsController` is deliberately **not** Admin-gated:
  the Course form needs its dropdowns.
- **Role matching is case-sensitive** (claims compare ordinally) while `AppUser`'s collation is
  `CI_AS` — a RoleId stored as `admin` is not `Admin`. Pinned by tests on both sides.
- **The default route moved to `/courses` for every role** — `app-roles` sits inside 系統管理, so it
  was a landing page non-Admins are now bounced out of. 課程管理 became `expanded: true` for the same
  reason.
- **🔐 The interceptor attaches the token only to `environment.apiUrl`** — a blanket header would hand
  the bearer token to `environment.publicSiteUrl`. It also must not redirect on the *login*
  endpoint's own 401 (a wrong password is a 401 too), and must not sign out on a 403.
- The profile lives in **session** storage, never local: it must die with the tab. Roles come from
  the token's claims, never a stored field or a second API call.

## My Profile

個人資料 My Profile — the signed-in user's own account: UserId (read-only), UserName (editable),
roles (display only), plus 變更密碼 Change Password. `PUT /api/auth/profile` and
`POST /api/auth/change-password`. Spec: `spec/auth/Profile.md`. Copy it for any self-service endpoint
that must act on **the caller** rather than an id in the body.

- **⚠️ `[AllowAnonymous]` on a CONTROLLER defeats `[Authorize]` on its actions.** `AuthController`
  hosts both anonymous login and this authenticated endpoint, so the attribute sits on the `Login`
  **action** — at class level it publishes the profile endpoint, and *status code alone will not tell
  you*: the action's own missing-`sub` check also answers 401. Measured both ways; details and the
  distinguishing evidence (`WWW-Authenticate`, repo-never-called) in `spec/auth/Authorization.md`.
- **The account is the token's `sub`, never the body.** Three independent layers: identity from the
  claim; a request DTO with *only* `UserName` so `userId`/`roleIds` bind to nothing; and a SET list
  with only the `UserName` column.
- **Do not reuse `IAppUserRepository.UpdateAsync` for a profile save** — it also writes `IsActive`
  and **replaces the user's AppUserRole rows**, so a self-service rename would silently wipe the
  user's own roles. `AuthRepository.UpdateUserNameAsync` is the narrow write. Verified live
  (transaction + rollback) that only UserName changes.
- **`[Required]` accepts `"   "`** (it only rejects `""`), so trim *then* validate, or a whitespace
  name reaches the DB and the shell renders a blank user. The response echoes the **stored** value so
  the client cannot drift from it.
- **No GET.** UserId/UserName come from the stored profile, roles from the token — a fetch would give
  roles a second source that could disagree with what the API enforces.
- The token is **not** reissued, so its `name` claim goes stale until the next login. Harmless —
  nothing reads it — but don't be surprised by it.
- **⚠️ A wrong current password is a `400`, not a `401`.** Any 401 makes the Angular interceptor
  clear the session and redirect to /login — so a typo would throw the user out of the form. Only
  "not signed in" may be a 401. Applies to every endpoint, not just this one.
- **Passwords are never trimmed; UserName is.** Same page, opposite rules: whitespace is part of a
  password (trimming would let `" x"` authenticate as `"x"`), but a display name is trimmed. Don't
  "tidy" one into the other.
- **`PasswordPolicy` lives in two languages** (`Data/PasswordPolicy.cs` + `core/utils/password-policy.util.ts`)
  and only their two test suites keep them in step. The C# copy is the rule; the TS copy is
  convenience. "Symbol" = the complement of upper/lower/digit, not a whitelist — so a space is a
  symbol, and so is CJK (no case).
- **`PasswordUpdatedTime` is written UTC** (decided with the user) because the UI renders it with
  `+ 'Z'`. It is the app's **first non-NULL `datetime` parameter** — verified live that Dapper sends
  a `DateTime` fine with no type handler, unlike `DateOnly`. It is passed from C#, not `GETDATE()`,
  so it is unambiguously UTC and testable.

## Row Audit

異動紀錄 — every repository Insert/Update/Delete writes one `dbo.RowAudit` row through the shared
reflection-based `Services/RowAuditWriter` (`IRowAuditWriter`), and every detail/form page shows the
record's history via `shared/row-audit-badge` (latest change inline; full trail in a `p-dialog` from
`GET /api/rowaudit?tableName=&pkid=`, newest first — `ORDER BY [DateTime] DESC, pkid DESC`, the
IDENTITY pkid breaking same-3ms-tick ties). The per-feature checklist lives in
`spec/reference/cross-cutting.md`; `PublishStatusRepository` + `PublishStatusRepositoryAuditTests`
are the reference retrofit, `RowAuditWriterTests` pins the reflection rules.

- **The audit INSERT rides the operation's own connection + transaction** (connection-bound
  overloads) — the three simple repositories gained transactions for exactly this; a 547-refused
  delete or failed write rolls the audit row back with it.
- **Snapshots select real columns + N-N pkid lists — no nav objects, no derived counts, never
  `PasswordHash`.** Navs reference-compare unequal across two reads → phantom "changed" columns;
  counts double-report their underlying list.
- **`FeaturedPromoItemRepository.MoveAsync` audits too** — a move is a Slot update; a swap logs one
  Update row per touched row.
- **⚠️ `RowAudit.DateTime` is server-LOCAL (`DateTime.Now`)** — the one `datetime` the frontend must
  NOT append `'Z'` to. Documented on both `RowAuditEntry` (C#) and `row-audit.model.ts`.
- **`ActionDesc` is `varchar(1000)`** (non-Unicode): CJK titles logged there may transcode lossily.
  Schema fact, known and accepted; values are truncated to fit, never allowed to throw.
- Password writes (`AuthRepository.UpdatePasswordAsync`) are deliberately **not** audited — scoped to
  the CRUD repositories; revisit if 變更密碼/reset must appear in the trail.

## Global exception handling

`Middleware/ExceptionHandlingMiddleware` — FIRST in the pipeline, Development included — catches
anything unhandled, logs the full exception (`LogError(ex, …)`), and answers one shape:
`500 { "message": ExceptionHandlingMiddleware.GenericMessage }`. The Angular `authInterceptor`
toasts API 5xx bodies through the **root** `MessageService` → the shell's global `<p-toast>`
(feature pages' own MessageService instances are separate — no crossover). Checklist in
`spec/reference/cross-cutting.md`; `ExceptionHandlingMiddlewareTests` +
`ExceptionHandlingIntegrationTests` and the interceptor spec are the proof.

- **Meaningful responses pass through untouched**: 401 challenge / 403 / validation 400 don't throw,
  and controller-level catches of *expected* exceptions (547 → 409) still win.
- **Nothing sensitive over the wire** — the integration test asserts the body carries no SQL text,
  connection string, exception type or stack frame, and that two different failures produce
  byte-identical bodies.
- A cancelled request rethrows (client gone ≠ server fault); a started response rethrows rather than
  writing a half-true body.
- **Pages must not add their own generic-500 toast** — the interceptor already covers it; local
  handling is for field/validation errors. Network-down (status 0) deliberately shows nothing yet.
- Cost note: the global toast moved `ToastModule` into the eager shell bundle (+54 kB initial; see
  frontend.md's budget section).
