# Adding a feature — workflow and recurring decisions

Read before scaffolding a new entity (typically via the `/crud` skill).

## Steps

1. Read the table script in `database/{sub-system}.sql` and, if present, the build spec at
   `spec/{sub-system}/{Table}.md`. **The schema is the source of truth** — not the mockups, not the
   sample specs, not the skill text.
2. **Backend**: the three DTOs, repository (interface + impl), controller; register the repo in
   `Program.cs`; add lookup endpoints if it's an FK target of another table.
   See `spec/reference/backend.md`.
3. **Frontend**: `core/models` + `core/services` entry, the three feature components, routes, and
   the sidebar link. See `spec/reference/frontend.md`.
4. **Tests both sides** (xUnit controller tests with a mocked repo; Karma specs for the service +
   components), then run both suites and a prod `ng build`.
5. **Smoke-test against the live dev DB** — see below.

## Smoke-testing against the dev DB

A populated SQL Server is reachable via the `CMS` connection string, so
`dotnet run --project CMS.API` + `curl http://localhost:5000/api/...` exercises the real SQL.
**Do it** — controller tests mock the repository, so they cannot catch SQL-semantics bugs. That is
how the lookup `ORDER BY` shadowing was found. `launchSettings.json` pins port 5000 and overrides
`ASPNETCORE_URLS`.

- **Query the data before finalizing the spec**, not just the schema. The `Course` default sort
  (`DisplayOrder` is not a global ordering) and the `DateOnly` handler requirement were both found
  this way and would have shipped as bugs otherwise. A throwaway `dotnet run` console project
  referencing Dapper is the fastest way to probe driver behaviour.
- **Leave the dev data as you found it.** Wrap any exploratory write in a transaction and roll it
  back; delete any rows you create; verify counts afterwards.
- **Git Bash mangles UTF-8 in `curl -d '{"title":"中文"}'`** (fails with *"The JSON value could not
  be converted to System.String"*). Write the payload to a file and use `curl --data-binary @file`
  — the API is fine; the shell is not.
- A literal `null` body to `POST /query` returns **400** from model binding before the controller's
  `?? new {Table}Query()` runs. Pre-existing and consistent across every controller; `{}` works. The
  `?? new()` guard only matters for direct unit-test calls.

## Decisions that recur

- **The `/crud` skill text is not the codebase.** It references `RowAuditWriter`,
  `RowAuditBadgeComponent` and a shared `core/services/lookup.service.ts` — **none exist here**.
  Lookup methods live on the feature service instead (e.g. `PartnerService.getPartnerOptions`).
  Follow the actual code; there is no row-audit infrastructure.
- **`spec/sample1.spec.md` / `sample2.spec.md` are format references only.** They describe a fuller
  system than this DB (sample1 is a Course spec with a `/copy` endpoint, sub-panels and RowAudit
  that do not exist here). Use them for structure; derive every fact from `database/*.sql`.
- **UI mockups (`ui-sample-*.png`) are style reference only** — the schema decides required fields
  (see AppRole's `Description`).
- **Column display names supplied in the `/crud` args override the sample specs.** `sample1.spec.md`
  calls `CourseId` 課程代碼 and `Partner` 合作廠商; the Course build spec uses the supplied
  簡介代碼 / 原廠. Supplied hints win; infer only the columns with no hint.
- **Don't wire links to routes that don't exist yet.** Record Primary-Foreign link buttons in the
  spec and omit them from the code until the target feature is built (e.g. Course's buttons to
  `CourseFAQ` / `CourseRelatedLink` / `HotCourse`). The converse also holds: once a target page
  exists, *do* wire it — Course links out to Partner / CourseGroup / PublishStatus.
- **A lookup endpoint is not a link — add it even when the target has no feature.** The "don't wire
  dead routes" rule is about *navigation*. Course needs `certifications` / `job-categories` lookups
  to save its own N-N data, so those were added even though neither `Certification` nor
  `JobCategory` has a CRUD page. Omitting them would silently drop the relations on save.
- **Default sort** when the table has no `DisplayOrder`: `pkid ASC` (see PublishStatus,
  CourseGroup) — not the `pkid DESC` the skill suggests. For a non-`pkid` PK, sort by the logical
  key (`AppRole` → `RoleId ASC`, `AppUser` → `UserId ASC`).
- **A `DisplayOrder` column does not automatically mean `ORDER BY DisplayOrder`.** Check the data
  first: few distinct values relative to row count means it is a *scoped* ordering, and sorting by it
  globally produces arbitrary ties. Prefer a column that is actually unique (`Course` →
  `CourseId ASC`; `Partner` → `DisplayOrder ASC` is genuinely fine). Record the reasoning in the spec.
- **Ask before inventing an endpoint the instructions only imply.** AppUser's reset-password route
  was described in passing but not requested — it was specced and deferred, not silently built.
