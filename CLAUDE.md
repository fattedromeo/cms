# CLAUDE.md

CMS admin console generated from SQL Server schemas.

- **Backend** — .NET 9 Web API, Dapper, **no EF**: `src/CMS.sln` = `CMS.API` (:5000, Swagger at
  `/swagger`) + `CMS.API.Tests` (xUnit + Moq). `src/global.json` pins the SDK to 9.x.
- **Frontend** — Angular 20 (standalone) + PrimeNG **v20** (pinned): `src/CMS.NG` (:4200).
- Run instructions: `src/README.md`.

```bash
# from src/
dotnet run --project CMS.API
dotnet test CMS.sln
# from src/CMS.NG/
npm start
npx ng test --watch=false --browsers=ChromeHeadless   # single-run (CI/verify)
npx ng build --configuration production               # a green ng test does NOT mean it compiles
```

## Reference docs — read the relevant one BEFORE writing code

The detail lives here, deliberately kept out of this file. Don't work from memory of them.

| Read this | When |
|-----------|------|
| `database/{sub-system}.sql` | **always** — the schema decides the truth |
| `spec/{sub-system}/{Table}.md` | that feature's build spec (e.g. `spec/course/Course.md`) |
| `spec/reference/backend.md` | touching `Models/` `Repositories/` `Controllers/` `Program.cs` |
| `spec/reference/frontend.md` | touching `src/CMS.NG` |
| `spec/reference/features.md` | modifying a feature, or copying the closest one |
| `spec/reference/workflow.md` | adding a new feature (the `/crud` flow) |
| `spec/auth/*.md` | touching auth (`Authorization`, `Login`, `Profile`, `AppUser`) |
| `spec/reference/cross-cutting.md` | adding any repository write or detail/form page (RowAudit + error-handling checklists) |
| `spec/code-gen.convention.md` | scaffolding shapes |

Implemented (one entry each in `features.md`): **AppRole**, **AppUser**, **Partner**,
**PublishStatus**, **Course**, **CourseGroup**, **FeaturedPromoItem**, **Login API**, app-wide **JWT
authorization**, **My Profile** (rename / change password; Admin reset-to-default on the AppUser form),
**Row Audit** (writer + per-record history badge), **global exception handling** (middleware + 5xx toast).

## Non-negotiables

Each fails **silently** (no exception, no failing test) and changes what you'd do by default. The line
is only the trigger — the linked doc holds the full rule and the war story.

**Truth & verification** → `workflow.md`

1. **Schema beats every other source** — sample specs, `/crud` text and `ui-sample-*.png` describe a
   fuller system than this DB. Every fact comes from `database/*.sql`.
2. **Verify against the live dev DB** (`CMS` conn) — mocked-repo tests can't catch SQL-semantics bugs;
   query the *data*, not just the schema. Leave it as found (transaction + rollback).
3. **`DisplayOrder` ≠ `ORDER BY DisplayOrder`** — few distinct values = a scoped ordering that ties
   arbitrarily (Course → `CourseId ASC`). Check the data.
4. **Don't wire links to routes that don't exist yet** — record them in the spec. Lookup *endpoints*
   are exempt: omitting one silently drops N-N data on save.

**SQL & DTOs** → `backend.md`

5. **Qualify every lookup `ORDER BY`** (`ORDER BY g.pkid`) — else a cast numeric-PK alias sorts
   `1, 10, 100, 2`. Shipped to prod once.
6. **Read the FK cascades before a DELETE** — a cascading child dies silently (no 547); a
   non-cascading junction must be hand-deleted first.
7. **🔐 Secret/derived columns get no DTO property** (`AppUser.PasswordHash`). `SysConfig.configValue`
   holds the JWT signing key **and** `defaultPassword`: never expose/log/return either. Verify a
   secret by hashing it **in-process**, printing only a boolean — never the plaintext.
8. **`date`/`DateOnly` needs `Data/DateOnlyTypeHandler.cs`** — the pinned Dapper/SqlClient map it in
   neither direction.

**Auth** → `Authorization.md` (+ `Login.md`, `Profile.md`, `AppUser.md`)

9. **`MapInboundClaims` defaults `true` and 403s every Admin** — it rewrites `role` to the
   `ClaimTypes.Role` URI, so `RoleClaimType="role"` matches nothing. Emit = validate = compare.
10. **A hidden menu/guard/button is not access control** — the API's `[Authorize(Roles=...)]` (403)
    is; the UI only mirrors it.
11. **`[AllowAnonymous]` on a *controller* defeats `[Authorize]` on its actions** — it goes on
    `AuthController.Login` alone. A 401 alone doesn't prove protection (the action can 401 itself);
    assert `WWW-Authenticate: Bearer` + repo untouched.
12. **A self-service write targets the JWT user, never the body** — and must not reuse
    `IAppUserRepository.UpdateAsync` (it replaces roles). No over-postable DTO property; one-column UPDATE.
13. **A 401 signs the user out** (the interceptor clears the session) — use it *only* for "not signed
    in"; a wrong **current** password is a `400`.
14. **Never trim a password** (but do trim `UserName`) — `" x"` must not authenticate as `"x"`.
15. **`PasswordUpdatedTime` is a claim about the hash, not an audit stamp** — `NULL` = on the shared
    default (create + Admin reset); a UTC value = user-chosen. "now" on a reset silently strands the
    user on the public default.

**Angular** → `frontend.md`

16. **`LookupItem.pkid` is a `string`** — numeric FK controls need `Number(...)` or `p-select`
    silently shows blank.
17. **Dates: use `core/utils/date.util.ts`** — never `toISOString()`/`new Date('yyyy-MM-dd')` (they
    shift the day in UTC+8). `'Z'` is for `datetime` only, never `DateOnly`.
18. **A `varchar` business key in a URL needs `encodeURIComponent`** — `CourseId`/`UserId` hold
    spaces, CJK, `@`. Raw interpolation breaks the URL with no error, and the pretty-case test passes.

**Cross-cutting (every repository write, every detail/form page)** → `cross-cutting.md`

19. **Every repository write logs to RowAudit** via `IRowAuditWriter`, on the **same
    connection/transaction** (audit rolls back with the change). Update/Delete **snapshot the row
    first**; snapshots = real columns + N-N pkids only — navs/derived counts/secrets poison the diff.
20. **Every detail/form page hosts `app-row-audit-badge`** (`tableName` + `pkid`; forms: `recordPkid`
    signal, `null` in create mode). `RowAudit.DateTime` is server-**local** — the one `datetime`
    that never gets `'Z'` (exception to rule 17).
21. **Unexpected errors belong to the global middleware** — no per-controller try/catch (specific
    catches like 547 → 409 stay); the client sees only the generic 500, never stack/SQL. 401/403/400
    keep their shapes.
22. **The interceptor already toasts API 5xx globally** — pages add no generic-error toast (it would
    double up); local handling is for validation only. 401 keeps signing out → `/login`.

## gstack

Use the `/browse` skill for **all** web browsing; never `mcp__claude-in-chrome__*`. The available
gstack skills are surfaced by the harness each session — don't maintain a copy here.
