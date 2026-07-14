# CMS — Full-Stack App

Generated from the database schema in `../database` per `../spec/code-gen.convention.md`.

## Projects

| Path | Stack | Port |
|------|-------|------|
| `CMS.API/` | .NET 9 Web API, Dapper (no EF), Swashbuckle | `http://localhost:5000` |
| `CMS.API.Tests/` | xUnit (+ Moq) controller tests | — |
| `CMS.NG/` | Angular 20 (standalone) + PrimeNG | `http://localhost:4200` |

SDK pinned to .NET 9 via `global.json`.

## Backend

```bash
cd CMS.API
dotnet run                 # http://localhost:5000, Swagger UI at /swagger
```

- Connection string `CMS` in `appsettings.json` targets `.\SQLEXPRESS` / `CMS`.
- CORS allows any loopback origin (dev).
- Run tests: `dotnet test CMS.sln`

### AppRole endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/app-roles` | List (sorted by RoleId) |
| POST | `/api/app-roles/query` | Filtered search (`keyword`, `permissionLevel`) |
| GET | `/api/app-roles/{id}` | Single role by RoleId (+ userIds) |
| POST | `/api/app-roles` | Create (409 on duplicate RoleId) |
| PUT | `/api/app-roles` | Update (RoleId in body) |
| DELETE | `/api/app-roles/{id}` | Delete (also clears AppUserRole) |
| GET | `/api/lookups/app-users` | AppUser options for the users picker |

`RoleId` (nvarchar) is the logical/route key; `pkid` is the display surrogate. Users
are an N-N relation via `AppUserRole`, synced delete-then-reinsert on write.

## Frontend

```bash
cd CMS.NG
npm install                # first time
npm start                  # ng serve on http://localhost:4200
npm test                   # Karma + Jasmine (ng test)
```

- API base URL comes from `src/environments/environment.ts` (`.prod` swapped in prod builds); no dev proxy.
- Path aliases: `@env/*`, `@app/*`, `@core/*`, `@features/*` (see `tsconfig.json`).
- AppRole feature: `features/app-roles/{app-role-list,app-role-detail,app-role-form}`.
- Sidebar entry: 系統管理 Admin → 角色 AppRole (`app.ts` / `app.html`).
