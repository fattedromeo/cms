# Build Spec for PublishStatus
- database schema: `.\database\admin.sql`

---

## Summary

`PublishStatus` is a small **lookup / enumeration table** describing the publishing
lifecycle state of content (draft / published / discontinued). It is an FK target of
`Course.PublishStatus_pkid` and `Promotion2.PublishStatus_pkid`. It has **no foreign
keys** and **no N-N relationships** of its own.

> **Critical detail:** `pkid` is `tinyint NOT NULL` but is **NOT `IDENTITY`** — the PK is
> manually assigned by the user (typical for an enum table). Therefore `pkid` is a
> **user-supplied, required field on create**, is **immutable / `disable()`d on edit**,
> and the INSERT statement lists `pkid` explicitly (there is **no `SCOPE_IDENTITY()`**).
> C# type is `byte`.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **tinyint, NOT IDENTITY** (user-assigned `byte`) |
| Foreign Keys | None |
| Required Fields | `pkid`, `Description`, `IsDraft`, `IsPublished`, `IsDiscontinued` (all NOT NULL) |
| N-N Relationships | N/A |
| Primary-Foreign Links | `Course.PublishStatus_pkid`, `Promotion2.PublishStatus_pkid` (both features not yet built — advisory only) |
| Query Filters | keyword (Description); tri-state bools `IsDraft`, `IsPublished`, `IsDiscontinued` |
| Default Sort | `pkid ASC` |

---

## Localization

### Chinese Table Name

- PublishStatus: 發布狀態
- Description: 內容發布生命週期狀態（草稿／已發布／已停用）代碼表

### Chinese Column Names

- pkid: 主代碼
- Description: 狀態說明
- IsDraft: 草稿
- IsPublished: 已發布
- IsDiscontinued: 已停用

---

## Required Fields

Required (NOT NULL — all columns):
- `pkid` — **user-supplied** on create (tinyint, not identity); disabled on edit
- `Description`
- `IsDraft`
- `IsPublished`
- `IsDiscontinued`

Optional (nullable): none.

---

## Foreign Keys

`PublishStatus` has no foreign key columns.

**N/A**

---

## Foreign-Primary Links

`PublishStatus` has no foreign key columns.

**N/A**

---

## Primary-Foreign Links

The following tables reference `PublishStatus.pkid` as a FK target. **Neither feature is
implemented yet**, so these links are documented for completeness but the target routes do
not exist. Scaffold the link buttons only if/when those features exist; otherwise omit
them (they would 404). Treat as **advisory**.

- **Course** (`Course.PublishStatus_pkid`) — future route `/courses?publishStatusPkid={pkid}`
  - Column header: 對應課程
  - Button label: 查看課程 (icon: `pi pi-book`)
- **Promotion2** (`Promotion2.PublishStatus_pkid`) — future route `/promotion2s?publishStatusPkid={pkid}`
  - Column header: 對應促銷
  - Button label: 查看促銷 (icon: `pi pi-tag`)

Because those list pages are not built, **do not** render these buttons in the initial
scaffold. Revisit when Course / Promotion2 are implemented.

---

## N-N Relationships

`PublishStatus` participates in no junction tables.

**N/A**

---

## Query Filters

`POST /api/publish-statuses/query` accepts:

- **keyword**: string
  - LIKE on `Description`

- **IsDraft**: bool?
  - Tri-state: null = no filter, true = only drafts, false = non-drafts
  - Exact match on `IsDraft`

- **IsPublished**: bool?
  - Tri-state exact match on `IsPublished`

- **IsDiscontinued**: bool?
  - Tri-state exact match on `IsDiscontinued`

No FK filters, no date-range filters (no FK or date/datetime columns).

---

## Lookup Endpoints Required

`PublishStatus` needs no lookups itself. It **is** a lookup source for other features, so
add its own lookup endpoint (used by future `Course` / `Promotion2` forms).

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/publish-statuses` | **New** | `LookupItem { pkid, label }` where `label = Description`, ordered by `pkid ASC` |

---

## API Endpoints

Standard CRUD (kebab-case plural route `publish-statuses`):

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/publish-statuses` | List all (ordered `pkid ASC`) |
| `POST` | `/api/publish-statuses/query` | Filtered query (body: `PublishStatusQuery`) |
| `GET` | `/api/publish-statuses/{id}` | Get by pkid (`byte`) |
| `POST` | `/api/publish-statuses` | Create — `pkid` supplied in body; 409 if pkid already exists |
| `PUT` | `/api/publish-statuses` | Update (pkid from body) |
| `DELETE` | `/api/publish-statuses/{id}` | Delete |

Plus the lookup:

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/lookups/publish-statuses` | Dropdown source for other features |

**Create conflict:** because `pkid` is user-assigned, `POST` should return **409 Conflict**
if the supplied `pkid` already exists (insert would otherwise throw a PK violation). The
repository checks existence first and the controller maps it to `Conflict(...)`.

No auth exceptions (same policy as other admin features).

---

## Backend Notes

### Models

```csharp
// Models/PublishStatus.cs
public class PublishStatus
{
    public byte Pkid { get; set; }
    public string Description { get; set; } = string.Empty;
    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}

// Models/PublishStatusRequest.cs
public class PublishStatusRequest
{
    public byte Pkid { get; set; }               // user-assigned PK (required on create)
    [Required, StringLength(50)]
    public string Description { get; set; } = string.Empty;
    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}

// Models/PublishStatusQuery.cs
public class PublishStatusQuery
{
    public string? Keyword { get; set; }
    public bool? IsDraft { get; set; }
    public bool? IsPublished { get; set; }
    public bool? IsDiscontinued { get; set; }
}
```

### SQL — SELECT

No FK aliases, no JOINs, no `nchar` (Description is `nvarchar`, no `RTRIM` needed).

```sql
-- GetAllAsync / GetByIdAsync / QueryAsync share this projection
SELECT pkid, Description, IsDraft, IsPublished, IsDiscontinued
FROM PublishStatus
-- GetAll / Query: ORDER BY pkid ASC
-- GetById: WHERE pkid = @Pkid
```

Query builds a dynamic WHERE:
```sql
WHERE (@Keyword IS NULL OR Description LIKE '%' + @Keyword + '%')
  AND (@IsDraft IS NULL OR IsDraft = @IsDraft)
  AND (@IsPublished IS NULL OR IsPublished = @IsPublished)
  AND (@IsDiscontinued IS NULL OR IsDiscontinued = @IsDiscontinued)
ORDER BY pkid ASC
```

### SQL — INSERT

`pkid` **is** included (not identity). No `SCOPE_IDENTITY()`.

```sql
-- Existence guard first (controller returns 409 on true):
SELECT COUNT(1) FROM PublishStatus WHERE pkid = @Pkid;

INSERT INTO PublishStatus (pkid, Description, IsDraft, IsPublished, IsDiscontinued)
VALUES (@Pkid, @Description, @IsDraft, @IsPublished, @IsDiscontinued);
```

`CreateAsync` returns the supplied `@Pkid` (byte), not a generated identity.

### SQL — UPDATE

`pkid` is the immutable key in the WHERE clause, never in the SET list.

```sql
UPDATE PublishStatus
SET Description = @Description,
    IsDraft = @IsDraft,
    IsPublished = @IsPublished,
    IsDiscontinued = @IsDiscontinued
WHERE pkid = @Pkid;
```

### SQL — DELETE

```sql
DELETE FROM PublishStatus WHERE pkid = @Pkid;
```

### N-N Sync Pattern

N/A — no junction tables.

### RowAudit

**Not implemented in this codebase.** The current `AppRoleRepository` does not inject any
`RowAuditWriter` (the generic skill mentions one, but no such type exists here), so
`PublishStatusRepository` mirrors `AppRoleRepository` and performs no audit logging.
If/when a `RowAuditWriter` is added, wire it into INSERT/UPDATE/DELETE here.

### Special Column Notes

- **`pkid` is `tinyint`, NOT `IDENTITY`** → C# `byte`; user-assigned; included in INSERT;
  immutable on UPDATE; no `SCOPE_IDENTITY()`. Analogous to `AppRole.RoleId` being the
  logical key, except here the key literally *is* `pkid`.
- No `nchar` columns → no `RTRIM()`.
- No `date` / `time` columns → no Dapper type handlers.
- All `bit` columns map to `bool`.

---

## Frontend Notes

### Route Table

| Path | Component | Notes |
|------|-----------|-------|
| `publish-statuses` | `PublishStatusListComponent` | list |
| `publish-statuses/new` | `PublishStatusFormComponent` | create (register **before** `/:id`) |
| `publish-statuses/:id` | `PublishStatusDetailComponent` | detail (id = pkid) |
| `publish-statuses/:id/edit` | `PublishStatusFormComponent` | edit |

### Angular Model

```ts
// core/models/publish-status.model.ts
export interface PublishStatus {
  pkid: number;
  description: string;
  isDraft: boolean;
  isPublished: boolean;
  isDiscontinued: boolean;
}
export interface PublishStatusRequest {
  pkid: number;
  description: string;
  isDraft: boolean;
  isPublished: boolean;
  isDiscontinued: boolean;
}
export interface PublishStatusQuery {
  keyword?: string | null;
  isDraft?: boolean | null;
  isPublished?: boolean | null;
  isDiscontinued?: boolean | null;
}
```

### Service

`core/services/publish-status.service.ts` — standard CRUD. `pkid` is numeric so
`encodeURIComponent` is not strictly required, but keep the pattern consistent
(`getById(id)` / `delete(id)` interpolate the numeric pkid into the URL).

### List Component

- `p-table` sortable/paginated; columns: 主代碼 (pkid), 狀態說明 (description), 草稿
  (isDraft), 已發布 (isPublished), 已停用 (isDiscontinued) — the three bools rendered as
  boolean tags/icons (e.g. `p-tag` or `pi-check`/`pi-times`).
- Default sort `pkid ASC`.
- Filter `p-drawer`: keyword input; three tri-state controls (`p-select` or a
  `p-triStateCheckbox`) for IsDraft / IsPublished / IsDiscontinued.
- Row actions: 檢視 / 編輯 / 刪除. **No** Primary-Foreign nav buttons (target features
  not built — see Primary-Foreign Links section).

### Detail Component

- Read-only card of all five fields; bools as tags (matches `AppRoleDetail`).
- No `RowAuditBadgeComponent` (not present in this codebase).
- No Primary-Foreign link buttons yet.

### Form Component

- Reactive Forms; page-header actions bar (matches `AppRoleForm`).
- `pkid`: `p-inputNumber` (min 0, max 255 — tinyint range). **Required.**
  **`disable()` in edit mode** (immutable key); enabled in new mode.
- `description`: `p-inputText`, required, maxlength 50.
- `isDraft` / `isPublished` / `isDiscontinued`: `p-checkbox` (or `p-toggleswitch`) each.
- No `forkJoin` lookups needed (no FKs).

### Delete Confirmation Message

```
確定要刪除主代碼 <b>${item.pkid}</b>「${item.description}」？
```

### Session Storage Keys

| Key | Contents |
|-----|----------|
| `publish-status-list-filters` | Last query filter values |
| `publish-status-list-sort` | `{ sortField, sortOrder }` |
| `publish-status-list-page` | `{ first, rows }` |

No incoming cross-entity query params (nothing navigates *into* this list yet).

### Sidebar Placement

Group **系統管理 Admin** (existing — already holds AppRole 角色). Add child link
**發布狀態 PublishStatus** → `/publish-statuses`.

### Special Form Behaviors

- `pkid` editable in new mode, `disable()`d in edit mode (the one non-obvious behavior).
- No auto-defaulting, no conditional visibility, no sub-panels.

### Sub-panels (edit mode only)

**N/A**

---

## Tests

### Backend (`CMS.API.Tests`)

`PublishStatusesControllerTests` with a mocked `IPublishStatusRepository`:
- `GetAll` → 200 with list.
- `Query` with a keyword / bool filter → 200, repo called with the query.
- `GetById` found → 200; not found → 404.
- `Create` new pkid → 201; **duplicate pkid → 409 Conflict**.
- `Create` missing `Description` (required) → 400.
- `Update` → 200/204; `Delete` → 204.

### Frontend (`CMS.NG`)

- `publish-status.service.spec.ts` — `HttpClientTestingModule` / `HttpTestingController`;
  assert each method hits the correct URL + verb.
- `publish-status-list`, `-detail`, `-form` component specs — mount with a mocked
  service (+ `provideNoopAnimations()`), assert render and that the form enforces
  required `pkid` (new mode) and `description`.

---

## Files to Create / Modify

### Backend (`CMS.API`)
| File | Action |
|------|--------|
| `Models/PublishStatus.cs` | create |
| `Models/PublishStatusRequest.cs` | create |
| `Models/PublishStatusQuery.cs` | create |
| `Repositories/IPublishStatusRepository.cs` | create |
| `Repositories/PublishStatusRepository.cs` | create |
| `Controllers/PublishStatusesController.cs` | create |
| `Controllers/LookupsController.cs` | modify — add `publish-statuses` lookup |
| `Program.cs` | modify — register repo in DI |

### Frontend (`CMS.NG`)
| File | Action |
|------|--------|
| `core/models/publish-status.model.ts` | create |
| `core/services/publish-status.service.ts` | create |
| `core/services/lookup.service.ts` | modify — add `getPublishStatuses()` |
| `features/publish-statuses/publish-status-list/*` | create |
| `features/publish-statuses/publish-status-detail/*` | create |
| `features/publish-statuses/publish-status-form/*` | create |
| `app.routes.ts` | modify — add 4 routes (`/new` before `/:id`) |
| `app.html` / `app.ts` | modify — sidebar link under 系統管理 Admin |

### Tests
| File | Action |
|------|--------|
| `CMS.API.Tests/PublishStatusesControllerTests.cs` | create |
| `CMS.NG/.../publish-status.service.spec.ts` | create |
| `CMS.NG/.../publish-status-list.component.spec.ts` | create |
| `CMS.NG/.../publish-status-detail.component.spec.ts` | create |
| `CMS.NG/.../publish-status-form.component.spec.ts` | create |
