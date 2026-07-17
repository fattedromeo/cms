# CLAUDE.md

CMS admin console generated from SQL Server schemas.

- **Backend** — .NET 9 Web API + Dapper (**no EF**): `src/CMS.sln` = `CMS.API` (:5000, `/swagger`) + `CMS.API.Tests` (xUnit + Moq). SDK pinned 9.x.
- **Frontend** — Angular 20 (standalone) + PrimeNG **v20** (pinned): `src/CMS.NG` (:4200). Run instructions: `src/README.md`.

```bash
dotnet run --project CMS.API                          # from src/
dotnet test CMS.sln                                   # from src/
npm start                                             # from src/CMS.NG/
npx ng test --watch=false --browsers=ChromeHeadless   # single-run (CI/verify)
npx ng build --configuration production               # green ng test ≠ compiles
```

## Reference docs — read the relevant one BEFORE writing code

The detail lives there, deliberately not here. Don't work from memory of them.

| Read this | When |
|-----------|------|
| `database/{sub-system}.sql` | **always** — the schema decides the truth |
| `spec/{sub-system}/{Table}.md` | that feature's build spec |
| `spec/reference/backend.md` | touching `Models/` `Repositories/` `Controllers/` `Program.cs` |
| `spec/reference/frontend.md` | touching `src/CMS.NG` |
| `spec/reference/features.md` | modifying a feature, or copying the closest one |
| `spec/reference/workflow.md` | adding a new feature (the `/crud` flow) |
| `spec/auth/*.md` | touching auth (`Authorization`, `Login`, `Profile`, `AppUser`) |
| `spec/reference/cross-cutting.md` | any repository write or detail/form page (RowAudit + error handling) |
| `spec/code-gen.convention.md` | scaffolding shapes |

Implemented features are indexed in `features.md` (one entry each) — read the entry before
modifying a feature, or the closest structural match before building a new one.

## Non-negotiables — triggers only

Each fails **silently** (no exception, no failing test). A line here is only the trigger; **read the group's doc for the full rule before acting on it.** Numbers are stable — specs cite them.

**Truth & verification** → `workflow.md`

1. **Schema beats every other source** — every fact comes from `database/*.sql`, not specs/samples.
2. **Verify data on the live dev DB** (`CMS` conn) — read-only, transaction + rollback.
3. **`DisplayOrder` ≠ `ORDER BY DisplayOrder`** — check the data for the scoped tiebreak.
4. **Don't wire links to routes that don't exist yet** (lookup *endpoints* are exempt).

**SQL & DTOs** → `backend.md`

5. **Qualify every lookup `ORDER BY`** (`ORDER BY g.pkid`) — alias shadowing sorts `1, 10, 100, 2`.
6. **Read the FK cascades before a DELETE.**
7. **🔐 Secret/derived columns get no DTO property**; never expose/log/print `SysConfig` values or hashes.
8. **`date`/`DateOnly` needs `Data/DateOnlyTypeHandler.cs`.**

**Auth** → `Authorization.md` (+ `Login.md`, `Profile.md`, `AppUser.md`)

9. **`MapInboundClaims` defaults `true` and 403s every Admin.**
10. **A hidden menu/guard/button is not access control** — the API's `[Authorize(Roles=...)]` is.
11. **`[AllowAnonymous]` on a *controller* defeats `[Authorize]` on its actions.**
12. **A self-service write targets the JWT user, never the body** — one-column UPDATE, no `UpdateAsync` reuse.
13. **401 means "not signed in" only** (it signs the user out); wrong current password = `400`.
14. **Never trim a password** (but do trim `UserName`).
15. **`PasswordUpdatedTime`: `NULL` = shared default; never set it on a reset.**

**Angular** → `frontend.md`

16. **`LookupItem.pkid` is a `string`** — numeric FK controls need `Number(...)`.
17. **Dates via `core/utils/date.util.ts`** — never `toISOString()`/`new Date('yyyy-MM-dd')`; `'Z'` never on `DateOnly`.
18. **A `varchar` business key in a URL needs `encodeURIComponent`.**

**Cross-cutting** → `cross-cutting.md`

19. **Every repository write logs to RowAudit** — same connection/transaction; snapshot before Update/Delete.
20. **Every detail/form page hosts `app-row-audit-badge`**; `RowAudit.DateTime` is server-local, never `'Z'`.
21. **Unexpected errors belong to the global middleware** — no per-controller try/catch.
22. **The interceptor already toasts API 5xx** — pages add no generic-error toast.

## gstack

Use `/browse` for **all** web browsing; never `mcp__claude-in-chrome__*`. Available gstack skills are surfaced each session — don't maintain a copy here.
