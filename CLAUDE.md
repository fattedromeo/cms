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
- **N-N relations**: carried as `List<...>` on the request; synced delete-then-reinsert
  inside a transaction on create/update (see `AppRoleRepository.ReplaceUsersAsync`).
- **`nchar(n)` columns**: always `RTRIM()` in SELECTs. `date`/`time` → `DateOnly`/`TimeOnly`
  with Dapper type handlers registered in `Program.cs` (none needed yet).
- `Program.cs` exposes `public partial class Program {}` so tests can reference the assembly.
- Tests: `CMS.API.Tests` needs `<FrameworkReference Include="Microsoft.AspNetCore.App" />`
  because it references MVC types (`ControllerBase`, `IActionResult`, ...).

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

## Adding a new feature

1. Read the table script in `database/` and (if present) its `spec/{feature}.spec.md`.
2. Backend: add the three DTOs, repository (interface + impl), controller; register the
   repo in `Program.cs`; add lookup endpoints if it's an FK target of another table.
3. Frontend: add `core/models` + `core/services` entry, the three feature components,
   routes, and the sidebar link.
4. Tests both sides (xUnit controller tests with a mocked repo; Karma specs for the
   service + components), then run both test suites and a prod `ng build`.
