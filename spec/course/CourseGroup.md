# Build Spec for CourseGroup
- database schema: `.\database\course.sql`

## Summary

`CourseGroup` is a small reference/lookup table that groups courses into categories (課程群組).
It carries a single descriptive column and is referenced as an FK target by `Course` and
`PartnerCourseGroup`. It has no outbound foreign keys and no N-N relationships — structurally
it is the simplest entity in the schema, closest to the already-implemented `PublishStatus`.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **smallint** IDENTITY(1,1) — auto-generated, immutable |
| Foreign Keys | None — **N/A** |
| Required Fields | `Description` |
| N-N Relationships | **N/A** |
| Primary-Foreign Links | `Course.CourseGroup_pkid` (nullable), `PartnerCourseGroup.CourseGroup_pkid` (NOT NULL) |
| Query Filters | keyword (`Description`) |
| Default Sort | `pkid ASC` |

---

## Localization

### Chinese Table Name

- CourseGroup: 課程群組
- Description: 課程分類群組主資料，供課程歸類使用

### Chinese Column Names

- pkid: 主代碼
- Description: 群組名稱

---

## Required Fields

Required (NOT NULL):
- `Description` — `nvarchar(100)` NOT NULL

Optional (nullable):
- None. `CourseGroup` has exactly one writable column and it is required.

`pkid` is `smallint IDENTITY` — excluded from the write DTO on create (SQL Server assigns it),
used as the immutable key on update. Display-only / disabled in the form.

---

## Foreign Keys

`CourseGroup` has no foreign key columns.

**N/A**

---

## Foreign-Primary Links

`CourseGroup` has no foreign key columns, so there is no outbound navigation.

**N/A**

---

## Primary-Foreign Links

Two tables reference `CourseGroup.pkid`:

- **Course** (`Course.CourseGroup_pkid` smallint **NULL**) — `FK_Course_CourseGroup`, `ON DELETE CASCADE`
  - Column header: 對應課程
  - Button label: 查看課程 (icon: `pi pi-book`)
  - Link target: `/courses?courseGroupPkid={pkid}`

- **PartnerCourseGroup** (`PartnerCourseGroup.CourseGroup_pkid` smallint **NOT NULL**) — `FK_PartnerCourseGroup_CourseGroup`, no cascade
  - Column header: 對應廠商課程群組
  - Button label: 查看廠商課程群組 (icon: `pi pi-sitemap`)
  - Link target: `/partner-course-groups?courseGroupPkid={pkid}`

> **Deferred in this build.** Neither the `Course` nor the `PartnerCourseGroup` feature exists yet
> (`app.routes.ts` currently only has `app-roles`, `partners`, `publish-statuses`). Wiring these
> buttons now would produce links to non-existent routes, so they are **omitted from the generated
> code** and recorded here for whoever builds `Course` / `PartnerCourseGroup` next.

---

## N-N Relationships

No junction table has an FK to `CourseGroup.pkid`. `PartnerCourseGroup` is *not* a junction table —
it has its own `pkid` IDENTITY plus `DisplayOrder` and `Description` columns, so it is a
first-class entity with its own CRUD feature, not an N-N link managed inline here.

**N/A**

---

## Query Filters

- **keyword**: string
  - LIKE on `Description` (the only string column)

No FK filters (no FK columns), no bool filters (no bit columns), no date-range filters
(no date/datetime columns).

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/course-groups` | **New** | `LookupItem { pkid, label }` — label = `Description`, ordered by `pkid ASC` |

`CourseGroup` is an FK target of `Course` (and `PartnerCourseGroup`), and `spec/sample1.spec.md`
already assumes `GET /api/lookups/course-groups` exists with label = `Description`, order `pkid ASC`.
This build adds it. `LookupItem.Pkid` is a **string**, so cast the smallint:
`CAST(pkid AS varchar(6)) AS Pkid` (matches `GetPartnersAsync`).

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/course-groups` | List all (ORDER BY `pkid ASC`) |
| `POST` | `/api/course-groups/query` | Filtered query (body: `CourseGroupQuery`) |
| `GET` | `/api/course-groups/{id}` | Get by smallint pkid — 404 if missing |
| `POST` | `/api/course-groups` | Create — 201 + `Location`; 400 on invalid model |
| `PUT` | `/api/course-groups` | Update (pkid from body, no route param) — 204 / 404 / 400 |
| `DELETE` | `/api/course-groups/{id}` | Delete — 204 / 404 / **409** on FK violation |

`pkid` is numeric, so the route needs no `encodeURIComponent` and the service takes a `number`.
No special endpoints (no copy/swap). No auth attributes — consistent with the existing controllers.

---

## Backend Notes

### Models

```csharp
// Models/CourseGroup.cs
public class CourseGroup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
}

// Models/CourseGroupRequest.cs
public class CourseGroupRequest
{
    public short Pkid { get; set; }

    [Required]
    [MaxLength(100)]
    public string Description { get; set; } = string.Empty;
}

// Models/CourseGroupQuery.cs
public class CourseGroupQuery
{
    /// <summary>LIKE match on Description.</summary>
    public string? Keyword { get; set; }
}
```

### SQL — SELECT

`Description` is `nvarchar` (not `nchar`) → **no `RTRIM()` needed**. No FK JOINs, no multi-map.

```sql
SELECT g.pkid, g.Description FROM CourseGroup g ORDER BY g.pkid ASC;
```

### SQL — INSERT

`pkid` is IDENTITY → excluded; return the generated key cast to smallint.

```sql
INSERT INTO CourseGroup (Description) VALUES (@Description);
SELECT CAST(SCOPE_IDENTITY() AS smallint);
```

### SQL — UPDATE

```sql
UPDATE CourseGroup SET Description = @Description WHERE pkid = @Pkid;
```

### SQL — DELETE

```sql
DELETE FROM CourseGroup WHERE pkid = @pkid;
```

### N-N Sync Pattern

**N/A** — no junction tables.

### Special Column Notes

- **`pkid` is `smallint`, not `int`** — C# `short` throughout (repo signatures, controller route
  param, `CAST(SCOPE_IDENTITY() AS smallint)`). Same shape as `Partner`.
- **No `nchar` columns** → no `RTRIM()`.
- **No `date`/`time` columns** → no Dapper type handlers needed.
- **⚠️ DELETE cascade hazard.** `FK_Course_CourseGroup` is declared `ON DELETE CASCADE`, so deleting
  a `CourseGroup` that still has courses will **silently delete those `Course` rows** rather than
  raise 547. In practice `FK_PartnerCourseGroup_CourseGroup` has *no* cascade, so a group used by a
  `PartnerCourseGroup` row is still blocked (547 → 409). The delete confirmation copy must warn about
  the course cascade — see *Delete Confirmation* below. Catch `SqlException` 547 in the controller
  and return 409, mirroring `PartnersController.Delete`.

---

## Frontend Notes

### Route table

| Route | Component |
|-------|-----------|
| `/course-groups` | `CourseGroupList` |
| `/course-groups/new` | `CourseGroupForm` (add mode) |
| `/course-groups/:id` | `CourseGroupDetail` |
| `/course-groups/:id/edit` | `CourseGroupForm` (edit mode) |

`new` is declared **before** `:id` so it is not swallowed by the param route.

### Angular model

```ts
export interface CourseGroup {
  pkid: number;
  description: string;
}
export interface CourseGroupRequest {
  pkid: number;
  description: string;
}
export interface CourseGroupQuery {
  keyword?: string | null;
}
```

### List component

- Columns: 主代碼 (`pkid`, ~6rem), 群組名稱 (`description`), 操作 (~9rem, view/edit/delete icon buttons).
- All columns sortable; `p-table` paginated, `[rowsPerPageOptions]="[10, 20, 50]"`, default `rows = 20`.
- Default sort: `sortField = 'pkid'`, `sortOrder = 1` (ASC).
- Filter drawer (`p-drawer`, position right): a single 關鍵字 text input bound to `filterDraft.keyword`.
- No lookups to load → **no `forkJoin`** on init (unlike FK-bearing lists).

### Form layout

| Field | Widget | Notes |
|-------|--------|-------|
| 主代碼 `pkid` | `p-inputNumber` `[useGrouping]="false"` | edit mode only; `disabled` — IDENTITY, system-assigned |
| 群組名稱 `description` | `input pInputText` `maxlength="100"` | `Validators.required`, `Validators.maxLength(100)` |

On create, `pkid` is sent as `0`; the response carries the server-assigned pkid and the form
navigates to `/course-groups/{pkid}`. On edit, the pkid comes from `getRawValue()` (disabled
controls are excluded from `.value`, so `getRawValue()` is required).

### Detail component

`dl.detail-grid` with 主代碼 and 群組名稱. Toolbar: 返回 / 編輯. No Primary-Foreign link buttons
in this build (see *Primary-Foreign Links* above).

### Delete Confirmation Message

Standard format plus a cascade warning (see the DELETE hazard note):

```
確定要刪除主代碼 <b>${item.pkid}</b>「${item.description}」？
此群組底下的課程將一併被刪除。
```

Error toast on 409: `此課程群組仍被廠商課程群組使用，無法刪除。`

### Session Storage Keys

| Key | Contents |
|-----|----------|
| `course-group-list-filters` | `{ keyword }` |
| `course-group-list-sort` | `{ sortField, sortOrder }` |
| `course-group-list-page` | `{ first, rows }` |

No incoming cross-entity query params (nothing navigates *to* this list yet).

### Date Handling

**N/A** — no date/datetime columns.

### Special Form Behaviors

**N/A** — no auto-defaulting, no conditional visibility, no `emitEvent: false` cases.

### Sub-panels (edit mode only)

**N/A**

### Sidebar placement

Existing group **課程管理 Course** (already present in `app.ts`, currently holding 合作廠商 Partner).
Add child: `{ label: '課程群組', labelEn: 'CourseGroup', icon: 'pi pi-tags', route: '/course-groups' }`.

---

## Tests

### Backend — `CMS.API.Tests/CourseGroupsControllerTests.cs`

Mock `ICourseGroupRepository` with `MockBehavior.Strict`; no live DB. Mirrors `PartnersControllerTests`:

- `GetAll` → 200 with items
- `Query` → passes keyword through; null body → empty query
- `GetById` found → 200 / missing → 404
- `Create` valid → `CreatedAtAction` with `RouteValues["id"]`; invalid model → `ValidationProblem` (400), repo never called
- `Update` existing → 204 / missing → 404 / invalid model → 400, repo never called
- `Delete` existing → 204 / missing → 404 / `SqlException` 547 → 409

> Note: `SqlException` cannot be constructed directly (no public ctor). The 409 path is covered by
> the repository throwing via a mock `.ThrowsAsync(...)` only if a `SqlException` instance can be
> fabricated; otherwise assert the 204/404 paths and leave 547→409 to integration coverage.

### Frontend

- `core/services/course-group.service.spec.ts` — `HttpTestingController`; assert URL + verb for
  `getAll`, `query`, `getById`, `create`, `update`, `delete`, `getCourseGroupOptions`.
  pkid is numeric → **no `encodeURIComponent` assertion**.
- `course-group-list.spec.ts` — loads via `query` on init; add/view/edit navigation; applyFilters
  persists + re-queries; clearFilters resets; onPage persists.
- `course-group-detail.spec.ts` — loads by numeric id; renders description; edit/back navigation.
- `course-group-form.spec.ts` — add mode invalid until `description` filled, create sends `pkid: 0`
  and navigates to response pkid; edit mode patches form, keeps `pkid` disabled, updates + navigates.

---

## Files to Create / Modify

### Backend (`src/CMS.API`)

| File | Action |
|------|--------|
| `Models/CourseGroup.cs` | Create |
| `Models/CourseGroupRequest.cs` | Create |
| `Models/CourseGroupQuery.cs` | Create |
| `Repositories/ICourseGroupRepository.cs` | Create |
| `Repositories/CourseGroupRepository.cs` | Create |
| `Controllers/CourseGroupsController.cs` | Create |
| `Repositories/ILookupRepository.cs` | Modify — add `GetCourseGroupsAsync` |
| `Repositories/LookupRepository.cs` | Modify — implement `GetCourseGroupsAsync` |
| `Controllers/LookupsController.cs` | Modify — add `GET course-groups` |
| `Program.cs` | Modify — register `ICourseGroupRepository` → `CourseGroupRepository` |

### Frontend (`src/CMS.NG`)

| File | Action |
|------|--------|
| `core/models/course-group.model.ts` | Create |
| `core/services/course-group.service.ts` | Create |
| `features/course-groups/course-group-list/{ts,html,scss}` | Create |
| `features/course-groups/course-group-detail/{ts,html,scss}` | Create |
| `features/course-groups/course-group-form/{ts,html,scss}` | Create |
| `app.routes.ts` | Modify — add lazy `course-groups` routes |
| `app.ts` | Modify — add 課程群組 child under 課程管理 Course |

### Tests

| File | Action |
|------|--------|
| `CMS.API.Tests/CourseGroupsControllerTests.cs` | Create |
| `core/services/course-group.service.spec.ts` | Create |
| `features/course-groups/course-group-list/course-group-list.spec.ts` | Create |
| `features/course-groups/course-group-detail/course-group-detail.spec.ts` | Create |
| `features/course-groups/course-group-form/course-group-form.spec.ts` | Create |
