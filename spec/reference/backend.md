# Backend reference (CMS.API)

Read before touching `Models/`, `Repositories/`, `Controllers/` or `Program.cs`.
Scaffolding shapes live in `spec/code-gen.convention.md`; this file is the hard-won detail.

## Structure

- **Layers**: `Models/` (response + `{Table}Request` + `{Table}Query` DTOs) →
  `Repositories/I{Table}Repository` + `{Table}Repository` (Dapper) → `Controllers/`.
- **Connections**: repositories take `IDbConnectionFactory` (see `Data/`), abstracted so
  controllers can be unit-tested with a mocked repo — **no live DB needed for tests**.
  Connection string `CMS` is in `appsettings.json`.
- **Routes**: `/api/{table-plural}` (kebab-case). `PUT` takes the key from the body, no route
  param. Lookups under `/api/lookups/{plural}` return `LookupItem { pkid, label }`.
- `Program.cs` exposes `public partial class Program {}` so tests can reference the assembly —
  `AuthorizationIntegrationTests` uses it with `WebApplicationFactory` to exercise the real pipeline.

## 🔐 Every new controller is authenticated by default — don't undo it

`Program.cs` sets an authorization `FallbackPolicy` requiring an authenticated user, so a controller
that declares nothing is **already protected**. That is the point: forgetting `[Authorize]` fails
closed instead of publishing a table. `AuthController` is the only `[AllowAnonymous]`, and adding a
second one needs a reason in the spec.

Admin-only tables (系統管理) carry `[Authorize(Roles = AdminRole.Name)]` → 403. Full rules, and the
`MapInboundClaims` trap that silently 403s every Admin, are in `spec/auth/Authorization.md`. **Read it
before touching auth wiring** — the failure mode there produces no exception and no failing test
unless you write the integration test for it.
- Tests: `CMS.API.Tests` needs `<FrameworkReference Include="Microsoft.AspNetCore.App" />`
  because it references MVC types (`ControllerBase`, `IActionResult`, ...).

## ⚠️ Lookup `ORDER BY` must be qualified

`LookupItem.Pkid` is a `string`, so numeric PKs get cast (`CAST(g.pkid AS varchar(6)) AS Pkid`).
SQL Server binds an *unqualified* `ORDER BY pkid` to the **select-list alias first**, so the varchar
alias shadows the base column and the sort goes lexicographic (`1, 2, 200, 3` / `10, 100, 11, 2`).

Always alias the table and qualify: `FROM CourseGroup g ... ORDER BY g.pkid ASC`. A qualified name
cannot bind to an alias. **This bit `publish-statuses` in production**; it applies to **every**
FK-target lookup whose PK is cast. A string PK (e.g. `RoleId`) needs no `CAST`, so the hazard does
not apply there.

## DELETE, 547 and cascades

- Catch `SqlException` where `Number == 547` (FK violation) → return `409` with a
  Traditional-Chinese message (see `PartnersController.Delete`).
- **Check `ON DELETE CASCADE` before writing a delete.** Read the FK definitions in
  `database/*.sql`: a cascading child is **silently deleted** rather than raising 547, so the UI
  confirm text must say so (`CourseGroup` → `Course`; `Course` → its two junctions).
- A **non**-cascading junction must be hand-deleted first, inside the transaction
  (`AppRoleRepository.DeleteAsync`, `AppUserRepository.DeleteAsync`). A cascading one must not be
  (`CourseRepository.DeleteAsync`).
- **`SqlException` cannot be unit-tested** — no public constructor, so a mocked repo can't throw it.
  The 547 → 409 path is *not* covered by controller tests; verify against the dev DB and note the
  gap in the spec.

## N-N relations

Carried as `List<...>` on the request; synced **delete-then-reinsert inside a transaction** on
create/update (see `AppRoleRepository.ReplaceUsersAsync`, `AppUserRepository.ReplaceRolesAsync`,
`CourseRepository.ReplaceCertificationsAsync`). Distinct + empty-list guard before insert.

Both sides of one junction may be managed independently (AppRole keys on `RoleId`, AppUser on
`UserId`) — they are complementary, not conflicting.

**A surrogate `pkid` does not disqualify a junction table.** The "exactly two FK columns" rule is
about **payload** columns: `AppUserRole` (pkid IDENTITY + 2 FKs) *is* a junction;
`PartnerCourseGroup` is a first-class entity because it adds `DisplayOrder`/`Description`.

## Column-type traps

- **`nchar(n)`**: always `RTRIM()` in SELECTs. `Certification.Title` comes back padded to a full
  100 chars — unRTRIMmed lookup labels carry ~50 trailing spaces.
- **`date` → `DateOnly` REQUIRES `Data/DateOnlyTypeHandler.cs`**, registered in `Program.cs` via
  `SqlMapper.AddTypeHandler(new DateOnlyTypeHandler())`. Not optional or defensive: the pinned stack
  (Dapper 2.1.79 + Microsoft.Data.SqlClient 7.0.2) supports `DateOnly` in **neither** direction —
  reads throw `DataException: Error parsing column`, params throw
  `NotSupportedException: ... cannot be used as a parameter value`. One `AddTypeHandler` call covers
  both `DateOnly` and `DateOnly?` (the nullable date-range filters).
- **`datetime` → `DateTime?` needs *no* handler** (that is only for `date`/`DateOnly`), but the
  frontend must append `'Z'` — see `spec/reference/frontend.md`.
- **No `TimeOnly` handler exists** — no table in use has a `time` column. Add one in the same file
  when that changes.
- **`decimal(9,0)` / `decimal(9,1)`** round-trip fine as `decimal`; mirror the scale in the form
  widget (`[maxFractionDigits]`).

## FK nav objects use Dapper multi-map

Alias each nav block's first column exactly `Pkid` and pass `splitOn: "Pkid,Pkid,Pkid"` — Dapper
searches each split from `startIdx + 1`, so the entity's own `c.pkid AS Pkid` at index 0 is skipped
rather than splitting the block away.

A `LEFT JOIN` miss yields a genuinely **null** nav object (not a zero-filled instance), so the map
lambda needs no null-coalescing. See `CourseRepository`; verified against the dev DB.

## 🔐 Keep secret / derived columns out of the DTOs entirely

Enforce by the type system, not a runtime check someone could forget. `AppUser.PasswordHash` is the
reference:

- no property on the response model → cannot leak (it is in no `AppUserRepository` SELECT list);
- no property on the request model → cannot be over-posted;
- absent from the UPDATE column list → cannot be changed.

Verified live: an over-posted `passwordHash` was ignored on both create and update.

**The one deliberate exception is the login credential check** (`AuthRepository`, see
`spec/auth/Login.md`), which must read the hash to compare it. It is a *separate* repository so
`IAppUserRepository`'s contract stays absolute, and its return type `UserCredential` lives in
`Repositories/`, **not** `Models/` — every type in `Models/` is client-reachable, so putting the hash
there would reintroduce exactly the leak the rule prevents. `LoginResponse` has no password property.
If you need the hash somewhere new, add a narrow repository rather than widening an existing DTO.

`SysConfig.configValue` holds a JWT signing secret (`symmetricSecurityKey`) next to
`defaultPassword`, so `ISysConfigRepository` returns only the one scalar — **no SysConfig
controller/DTO/lookup**, and the value never reaches a log or exception message.
