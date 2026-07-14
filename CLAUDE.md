# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A CMS admin console generated from SQL Server schemas. Backend is a .NET 9 Web API
(Dapper, **no EF**); frontend is Angular 20 (standalone components) + PrimeNG. Code is
generated per the patterns in `spec/code-gen.convention.md` — read it before adding a
feature. The database schemas live in `database/*.sql`; feature build specs live in
`spec/*.spec.md` (see `spec/sample1.spec.md`, `spec/sample2.spec.md` for the format).

## Layout

```
database/            SQL Server table scripts (source of truth for the schema)
spec/                Conventions, feature specs, UI mockups (ui-sample-*.png = style only)
src/
  global.json        Pins the .NET SDK to 9.x
  CMS.sln            Solution (CMS.API + CMS.API.Tests)
  CMS.API/           .NET 9 Web API — Dapper, Swashbuckle, port 5000
  CMS.API.Tests/     xUnit + Moq controller tests
  CMS.NG/            Angular 20 + PrimeNG — port 4200
  README.md          Run instructions
```

## Commands

Backend (from `src/`):
```bash
dotnet run --project CMS.API      # http://localhost:5000, Swagger at /swagger
dotnet test CMS.sln               # xUnit tests
```

Frontend (from `src/CMS.NG/`):
```bash
npm start                                          # ng serve, http://localhost:4200
npm test                                           # Karma + Jasmine (interactive)
npx ng test --watch=false --browsers=ChromeHeadless  # single-run (CI/verify)
npx ng build --configuration production            # prod build (checks budgets + env swap)
```

## Backend conventions

- **Layers**: `Models/` (response + `{Table}Request` + `{Table}Query` DTOs) →
  `Repositories/I{Table}Repository` + `{Table}Repository` (Dapper) → `Controllers/`.
- **Connections**: repositories take `IDbConnectionFactory` (see `Data/`), which is
  abstracted so controllers can be unit-tested with a mocked repo — **no live DB needed
  for tests**. Connection string `CMS` is in `appsettings.json`.
- **Routes**: `/api/{table-plural}` (kebab-case). `PUT` takes the key from the body, no
  route param. Lookups under `/api/lookups/{plural}` return `LookupItem { pkid, label }`.
- **Lookup `ORDER BY` must be qualified.** `LookupItem.Pkid` is a `string`, so numeric PKs are
  cast (`CAST(g.pkid AS varchar(6)) AS Pkid`). SQL Server binds an *unqualified* `ORDER BY pkid`
  to the **select-list alias first**, so the varchar alias shadows the base column and the sort
  goes lexicographic (`1, 2, 200, 3` / `10, 100, 11, 2`). Always alias the table and qualify:
  `FROM CourseGroup g ... ORDER BY g.pkid ASC`. A qualified name cannot bind to an alias.
  This bit `publish-statuses` in production; it applies to **every** FK-target lookup.
- **DELETE**: catch `SqlException` where `Number == 547` (FK violation) and return `409` with a
  Traditional-Chinese message (see `PartnersController.Delete`).
- **Check `ON DELETE CASCADE` before writing a delete.** Read the FK definitions in
  `database/*.sql`: a cascading child is silently deleted rather than raising 547, so the UI
  confirm text must say so (see `CourseGroup` → `Course`).
- **N-N relations**: carried as `List<...>` on the request; synced delete-then-reinsert
  inside a transaction on create/update (see `AppRoleRepository.ReplaceUsersAsync`).
- **`nchar(n)` columns**: always `RTRIM()` in SELECTs. `date`/`time` → `DateOnly`/`TimeOnly`
  with Dapper type handlers registered in `Program.cs` (none needed yet).
- `Program.cs` exposes `public partial class Program {}` so tests can reference the assembly.
- Tests: `CMS.API.Tests` needs `<FrameworkReference Include="Microsoft.AspNetCore.App" />`
  because it references MVC types (`ControllerBase`, `IActionResult`, ...).
- **`SqlException` cannot be unit-tested** — it has no public constructor, so a mocked repo
  can't throw it. The 547 → 409 path is therefore *not* covered by controller tests; verify it
  against the dev DB instead and note the gap in the spec.

## Frontend conventions

- Standalone components, lazy-loaded routes (`app.routes.ts`).
- **No API proxy** — base URL from `src/environments/environment.ts`; `environment.prod.ts`
  is swapped in via `fileReplacements` in `angular.json`.
- **Path aliases** (`tsconfig.json`): `@env/*`, `@app/*`, `@core/*`, `@features/*`.
- Feature folders: `features/{table-plural}/{table}-list | {table}-detail | {table}-form`.
- Services live in `core/services`, models in `core/models`.
- List pages: `p-table` (sortable/paginated) + filter `p-drawer`; persist filters/sort/page
  to `sessionStorage` under `{table}-list-filters | -sort | -page`.
- Forms: Reactive Forms, `forkJoin` for parallel lookup loads; string PK is `disable()`d in
  edit mode (it's the immutable key); `p-multiselect` for N-N with `[maxSelectedLabels]="9999"`.
- PrimeNG needs animations (`provideAnimationsAsync`) + `providePrimeNG` theme (`app.config.ts`).
  In component specs, provide `provideNoopAnimations()`.
- Sidebar nav lives in `app.ts` / `app.html`; add a child under the right group.
- **PrimeNG version is pinned to v20** — `primeng@latest` pulls v21 which requires Angular 21.
  In v20 the old `Sidebar` is `Drawer` (`p-drawer`, `primeng/drawer`).

## Implemented features

- **AppRole** (系統管理 Admin → 角色 AppRole) — CRUD with N-N users via `AppUserRole`.
  - **Key detail**: `dbo.AppRole` has both `pkid` (IDENTITY, display only = 主代碼) and
    `RoleId` (nvarchar, the clustered PK / FK target). `RoleId` is the logical key used in
    routes (`/api/app-roles/{id}`, `encodeURIComponent`) and disabled in the edit form;
    `pkid` is never used as the route key. Apply the same reasoning to any table whose PK
    constraint is on a non-`pkid` column.
  - `Description` is `NULL` in the schema, so it's **optional** in code — even though the
    `ui-sample-add.png` mockup shows an asterisk. UI mockups are style reference only;
    the schema decides required fields.

- **Partner** (課程管理 Course → 合作廠商 Partner) — plain CRUD, no FKs. `pkid` is
  `smallint IDENTITY`; sorted by `DisplayOrder ASC`. The reference implementation to copy for
  any IDENTITY-PK table.

- **PublishStatus** (系統管理 Admin → 發布狀態 PublishStatus) — plain CRUD.
  - **Key detail**: `pkid` is `tinyint` and **not** IDENTITY — it is user-assigned, so it is
    included in the INSERT column list and there is no `SCOPE_IDENTITY()`. Don't assume a
    `pkid` is auto-generated; check for `IDENTITY` in the table script.

- **CourseGroup** (課程管理 Course → 課程群組 CourseGroup) — plain CRUD; `pkid` `smallint
  IDENTITY` + one required `Description`. Spec: `spec/course/CourseGroup.md`.
  - **Key detail**: `FK_Course_CourseGroup` is `ON DELETE CASCADE`, so deleting a group
    **silently deletes its courses**. The delete confirm warns about this.
    `FK_PartnerCourseGroup_CourseGroup` does not cascade and still blocks via 547 → 409.
  - `PartnerCourseGroup` is **not** an N-N junction (it has its own `pkid` IDENTITY plus
    `DisplayOrder`/`Description`) — it's a first-class entity. A junction table has *exactly*
    two FK columns and nothing else.

## Adding a new feature

1. Read the table script in `database/` and (if present) its `spec/{feature}.spec.md`.
2. Backend: add the three DTOs, repository (interface + impl), controller; register the
   repo in `Program.cs`; add lookup endpoints if it's an FK target of another table.
3. Frontend: add `core/models` + `core/services` entry, the three feature components,
   routes, and the sidebar link.
4. Tests both sides (xUnit controller tests with a mocked repo; Karma specs for the
   service + components), then run both test suites and a prod `ng build`.
5. **Smoke-test against the live dev DB.** A populated SQL Server is reachable via the `CMS`
   connection string, so `dotnet run --project CMS.API` + `curl http://localhost:5000/api/...`
   exercises the real SQL. Do it — controller tests mock the repository, so they cannot catch
   SQL-semantics bugs (that's how the lookup `ORDER BY` shadowing above was found). Note
   `launchSettings.json` pins port 5000 and overrides `ASPNETCORE_URLS`.

### Decisions that recur

- **Don't wire links to routes that don't exist yet.** Record Primary-Foreign link buttons in
  the spec and omit them from the code until the target feature is built (e.g. CourseGroup's
  buttons to `Course` / `PartnerCourseGroup`).
- **The `/crud` skill text is not the codebase.** It references `RowAuditWriter`,
  `RowAuditBadgeComponent` and a shared `core/services/lookup.service.ts` — **none exist here**.
  Lookup methods live on the feature service instead (e.g. `PartnerService.getPartnerOptions`).
  Follow the actual code; there is no row-audit infrastructure.
- **Default sort** when the table has no `DisplayOrder`: `pkid ASC` (see PublishStatus,
  CourseGroup) — not the `pkid DESC` the skill suggests.
