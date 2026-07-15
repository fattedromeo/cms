# CLAUDE.md

CMS admin console generated from SQL Server schemas. Backend: .NET 9 Web API — Dapper, **no EF**.
Frontend: Angular 20 (standalone) + PrimeNG **v20** (pinned).

## Layout

```
database/            SQL Server table scripts — SOURCE OF TRUTH for the schema
spec/                Feature build specs, conventions, reference docs, UI mockups
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
npm start                                            # ng serve, http://localhost:4200
npx ng test --watch=false --browsers=ChromeHeadless  # single-run (CI/verify)
npx ng build --configuration production              # prod build (budgets + env swap)
```

## Reference docs — read the relevant one BEFORE writing code

These hold the detail deliberately kept out of this file. Don't work from memory of them.

| Read this | When |
|-----------|------|
| `spec/reference/backend.md` | touching `Models/` `Repositories/` `Controllers/` `Program.cs` |
| `spec/reference/frontend.md` | touching `src/CMS.NG` |
| `spec/reference/features.md` | modifying a feature, or copying the closest one |
| `spec/reference/workflow.md` | adding a new feature (the `/crud` flow) |
| `spec/code-gen.convention.md` | scaffolding shapes |
| `database/{sub-system}.sql` | **always** — the schema decides the truth |
| `spec/{sub-system}/{Table}.md` | that feature's build spec (e.g. `spec/course/Course.md`) |

Implemented: **AppRole**, **AppUser**, **Partner**, **PublishStatus**, **Course**, **CourseGroup**,
**FeaturedPromoItem** — details in `spec/reference/features.md`.

## Non-negotiables

Everything below fails **silently** — no exception, no failing test. The rest is in the reference
docs; these are here because they change what you'd otherwise do by default.

1. **The schema is the source of truth.** `spec/sample1.spec.md` / `sample2.spec.md` describe a
   *fuller system than this DB*, the `/crud` skill text references infrastructure that **does not
   exist here** (RowAudit, a shared lookup service), and `ui-sample-*.png` mockups are style only.
   Derive every fact from `database/*.sql`. See `spec/reference/workflow.md`.

2. **Verify against the live dev DB — don't assume.** A populated SQL Server is on the `CMS`
   connection string. Controller tests mock the repository, so they **cannot** catch SQL-semantics
   bugs; that is how the lookup `ORDER BY` bug, the `DateOnly` requirement and the
   FeaturedPromoItem slot-swap `2627` were found. Query the *data*, not just the schema — it also
   decides the shape: FeaturedPromoItem's slots turned out to be sparse, and its `Topic` turned out
   not to mirror its promo's. Leave dev data as you found it (transaction + rollback).

3. **Qualify every lookup `ORDER BY`.** A cast numeric PK (`CAST(g.pkid AS varchar(6)) AS Pkid`)
   makes an unqualified `ORDER BY pkid` bind to the varchar **alias**, sorting `1, 10, 100, 2`.
   Write `ORDER BY g.pkid`. This shipped to production once.

4. **Read the FK cascades before writing a DELETE.** A cascading child is deleted *silently*
   instead of raising 547 → the confirm text must say so. A non-cascading junction must be
   hand-deleted first.

5. **A `DisplayOrder` column does not mean `ORDER BY DisplayOrder`.** Check the data: if it has few
   distinct values it is a *scoped* ordering and sorts arbitrarily (Course → `CourseId ASC`).

6. **Dates:** `date`/`DateOnly` needs `Data/DateOnlyTypeHandler.cs` (the pinned Dapper/SqlClient
   support it in neither direction). On the frontend use `core/utils/date.util.ts` — never
   `toISOString()` or `new Date('yyyy-MM-dd')`, both of which shift the day in UTC+8. `'Z'` is for
   `datetime` columns only, never for `DateOnly`.

7. **`LookupItem.pkid` is a `string`;** numeric FK controls need `Number(...)` mapping or the
   `p-select` silently shows blank.

8. **🔐 Keep secret/derived columns out of the DTOs entirely** — no property to bind means it cannot
   leak or be over-posted (`AppUser.PasswordHash`). `SysConfig.configValue` holds a JWT signing key:
   never expose, log, or put it in an exception message.

9. **Don't wire links to routes that don't exist yet** — record them in the spec instead. (Lookup
   *endpoints* are exempt: omitting one silently drops N-N data on save.)

10. **A `varchar` business key in a URL needs `encodeURIComponent` — check the data first.** These
    keys are not the tidy alphanumerics they look like: `Course.CourseId` holds spaces, *trailing*
    spaces, parens and CJK (15 of 1,080 rows); `AppUser.UserId` is an email. Raw interpolation just
    emits a broken URL — no exception, and a test asserting the pretty case still passes.
