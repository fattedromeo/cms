# Build Spec for Partner
- database schema: `.\database\course.sql`

## Summary

`Partner` represents a course-offering partner / vendor (合作廠商). It is a small,
flat lookup-style entity with a display name, an application key, two context-specific
display names (one for the partner menu, one for the course detail page), a sort order,
and an optional logo image filename. It has **no foreign keys of its own**, but it is
the FK target of several other tables (`Course`, `Certification`, `PartnerCourseGroup`),
so a `partners` lookup endpoint is provided for those consumers.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **smallint IDENTITY** (auto-generated; use `SCOPE_IDENTITY()`) |
| Foreign Keys | None |
| Required Fields | `Name`, `AppKey`, `NameOnPartnerMenu`, `NameOnCourseDetailPage`, `DisplayOrder` |
| N-N Relationships | N/A |
| Primary-Foreign Links | `Course`, `Certification`, `PartnerCourseGroup` reference `Partner.pkid` (features not yet built — see note) |
| Query Filters | keyword (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage) |
| Default Sort | `DisplayOrder ASC` |

---

## Localization

### Chinese Table Name

- Partner: 合作廠商
- Description: 課程合作廠商主資料

### Chinese Column Names

- pkid: 主代碼
- Name: 名稱
- AppKey: 應用代碼
- NameOnPartnerMenu: 廠商選單顯示名稱
- NameOnCourseDetailPage: 課程詳情頁顯示名稱
- DisplayOrder: 顯示順序
- ImageFilename: 圖片檔名

---

## Required Fields

Required (NOT NULL, excluding IDENTITY PK):

- `Name` NOT NULL — `nvarchar(50)`
- `AppKey` NOT NULL — `varchar(10)`
- `NameOnPartnerMenu` NOT NULL — `nvarchar(200)`
- `NameOnCourseDetailPage` NOT NULL — `nvarchar(50)`
- `DisplayOrder` NOT NULL — `int`

Optional (nullable):

- `ImageFilename` NULL — `varchar(50)`

---

## Foreign Keys

`Partner` has no foreign key columns.

**N/A**

---

## Foreign-Primary Links

`Partner` has no foreign key columns.

**N/A**

---

## Primary-Foreign Links

The following tables reference `Partner.pkid` as a foreign key:

- **Course** (`Course.Partner_pkid` → `Partner.pkid`) — column header 對應課程, link to `/courses?partnerPkid={pkid}`
- **Certification** (`Certification.Partner_pkid` → `Partner.pkid`) — column header 對應認證, link to `/certifications?partnerPkid={pkid}`
- **PartnerCourseGroup** (`PartnerCourseGroup.Partner_pkid` → `Partner.pkid`) — column header 對應廠商課程群組, link to `/partner-course-groups?partnerPkid={pkid}`

**Build note:** none of these child features are implemented yet (no routes exist).
To avoid broken navigation, the generated list/detail pages will **not** render these
link buttons until the corresponding child features are built. This section documents
the intended links for when they are.

---

## N-N Relationships

No junction table has both of its FK columns pointing at `Partner` alone.
`PartnerCourseGroup` carries its own `pkid`, `DisplayOrder`, and `Description` columns,
so it is a full child entity (a Primary-Foreign link), not a simple N-N junction.

**N/A**

---

## Query Filters

- **keyword**: string
  - LIKE on `Name`, `AppKey`, `NameOnPartnerMenu`, `NameOnCourseDetailPage`
  - (All are short identifying string columns; no large text columns to exclude.)

No FK filters, bool filters, or date-range filters apply.

---

## Lookup Endpoints Required

Partner's own CRUD needs **no** lookups (it has no FKs). It provides one lookup for
future consumers (`Course`, `Certification`, `PartnerCourseGroup`):

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/partners` | **New** | Partner options — `pkid` (cast to string) + `Name` label, ordered by `DisplayOrder ASC` |

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/partners` | List all (default sort `DisplayOrder ASC`) |
| `POST` | `/api/partners/query` | Filtered query (body: `PartnerQuery`) |
| `GET` | `/api/partners/{id}` | Get by `pkid` (smallint) |
| `POST` | `/api/partners` | Create (returns 201, `pkid` from `SCOPE_IDENTITY()`) |
| `PUT` | `/api/partners` | Update (`pkid` from body; it is the immutable key) |
| `DELETE` | `/api/partners/{id}` | Delete by `pkid` |
| `GET` | `/api/lookups/partners` | Lookup options for FK consumers |

No auth exceptions.

---

## Backend Notes

### Models

```csharp
public class Partner
{
    public short Pkid { get; set; }
    public string Name { get; set; } = string.Empty;
    public string AppKey { get; set; } = string.Empty;
    public string NameOnPartnerMenu { get; set; } = string.Empty;
    public string NameOnCourseDetailPage { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public string? ImageFilename { get; set; }
}

public class PartnerRequest
{
    public short Pkid { get; set; }                       // 0 on create; set on update

    [Required, StringLength(50)]
    public string Name { get; set; } = string.Empty;

    [Required, StringLength(10)]
    public string AppKey { get; set; } = string.Empty;

    [Required, StringLength(200)]
    public string NameOnPartnerMenu { get; set; } = string.Empty;

    [Required, StringLength(50)]
    public string NameOnCourseDetailPage { get; set; } = string.Empty;

    public int DisplayOrder { get; set; }

    [StringLength(50)]
    public string? ImageFilename { get; set; }
}

public class PartnerQuery
{
    public string? Keyword { get; set; }
}
```

### SQL — SELECT

No FK JOINs (no FKs). No `nchar` columns (all `nvarchar`/`varchar`), so no `RTRIM()` needed.

```sql
SELECT p.pkid, p.Name, p.AppKey, p.NameOnPartnerMenu,
       p.NameOnCourseDetailPage, p.DisplayOrder, p.ImageFilename
FROM Partner p
ORDER BY p.DisplayOrder ASC;
```

Query WHERE (keyword):
```sql
WHERE (p.Name LIKE @kw OR p.AppKey LIKE @kw
       OR p.NameOnPartnerMenu LIKE @kw OR p.NameOnCourseDetailPage LIKE @kw)
```

### SQL — INSERT

`pkid` is IDENTITY → excluded from the column list; return the new key.

```sql
INSERT INTO Partner (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage, DisplayOrder, ImageFilename)
VALUES (@Name, @AppKey, @NameOnPartnerMenu, @NameOnCourseDetailPage, @DisplayOrder, @ImageFilename);
SELECT CAST(SCOPE_IDENTITY() AS smallint);
```

### SQL — UPDATE

```sql
UPDATE Partner
   SET Name = @Name,
       AppKey = @AppKey,
       NameOnPartnerMenu = @NameOnPartnerMenu,
       NameOnCourseDetailPage = @NameOnCourseDetailPage,
       DisplayOrder = @DisplayOrder,
       ImageFilename = @ImageFilename
 WHERE pkid = @Pkid;
```

### SQL — DELETE

```sql
DELETE FROM Partner WHERE pkid = @pkid;
```

`Partner` is referenced by `Course`, `Certification`, and `PartnerCourseGroup` via FK
constraints; a delete of an in-use partner will fail with a FK violation (SQL error 547).
The controller returns **409 Conflict** in that case (caught `SqlException`), consistent
with surfacing a friendly message rather than a 500.

### N-N Sync Pattern

**N/A** — no junction tables.

### Special Column Notes

- `pkid` is **smallint IDENTITY** → C# `short`; controller/repo signatures use `short id`.
  Insert uses `SELECT CAST(SCOPE_IDENTITY() AS smallint)` (contrast with PublishStatus,
  whose tinyint pkid is user-assigned).
- No `nchar` columns → no `RTRIM()`.
- No `date`/`time` columns → no Dapper type handlers needed.

### Lookup — `GET /api/lookups/partners`

```sql
SELECT CAST(pkid AS varchar(6)) AS Pkid, Name AS Label
FROM Partner
ORDER BY DisplayOrder ASC;
```

Add `GetPartnersAsync` to `ILookupRepository` / `LookupRepository` and a
`GET partners` action to `LookupsController`. Add `getPartners()` to the frontend
`lookup.service.ts` for future FK consumers.

---

## Frontend Notes

### Route Table

| Path | Component |
|------|-----------|
| `/partners` | `PartnerList` |
| `/partners/new` | `PartnerForm` (create) |
| `/partners/:id` | `PartnerDetail` |
| `/partners/:id/edit` | `PartnerForm` (edit) |

Route order: register `/partners/new` **before** `/partners/:id`.

### Angular Model

```ts
export interface Partner {
  pkid: number;
  name: string;
  appKey: string;
  nameOnPartnerMenu: string;
  nameOnCourseDetailPage: string;
  displayOrder: number;
  imageFilename: string | null;
}

export type PartnerRequest = Omit<Partner, never>; // same shape; pkid 0 on create

export interface PartnerQuery {
  keyword?: string | null;
}
```

### List Component

- `p-table`, sortable + paginated, default sort `displayOrder ASC`.
- Columns: 主代碼 (pkid), 名稱 (name), 應用代碼 (appKey), 廠商選單顯示名稱 (nameOnPartnerMenu),
  課程詳情頁顯示名稱 (nameOnCourseDetailPage), 顯示順序 (displayOrder), 圖片檔名 (imageFilename), actions.
- Filter `p-drawer` with a single keyword input.
- Row actions: 檢視 (detail), 編輯 (edit), 刪除 (delete).
- Primary-Foreign link buttons are **omitted** for now (child features not built).

### Detail Component

- Read-only card of all fields.
- Toolbar: 返回 / 編輯 / 刪除.
- No `RowAuditBadgeComponent` (no audit infrastructure in this codebase).

### Form Component

Reactive Forms, sticky `p-toolbar` (儲存 / 取消). One control per field:

| Field | Widget | Notes |
|-------|--------|-------|
| pkid | `p-inputnumber` (disabled) | edit mode only, immutable key |
| name | `input pInputText` | required, maxlength 50 |
| appKey | `input pInputText` | required, maxlength 10 |
| nameOnPartnerMenu | `input pInputText` | required, maxlength 200 |
| nameOnCourseDetailPage | `input pInputText` | required, maxlength 50 |
| displayOrder | `p-inputnumber` | required |
| imageFilename | `input pInputText` | optional, maxlength 50 |

No `forkJoin` lookups needed (no FKs). No special valueChanges behaviors.

### Delete Confirmation

```
確定要刪除主代碼 <b>${item.pkid}</b>「${item.name}」？
```

### Session Storage Keys

| Key | Contents |
|-----|----------|
| `partner-list-filters` | Last query filter values |
| `partner-list-sort` | `{ sortField, sortOrder }` |
| `partner-list-page` | `{ first, rows }` |

No incoming cross-entity query params (Partner is a top-level entity).

### Sidebar Placement

Nav group **課程管理 Course** (new group — does not exist yet; AppRole/PublishStatus are
under 系統管理 Admin). Add the group in `app.html` / `app.ts`, then a child link
「合作廠商 Partner」 → `/partners`.

---

## Files to Create / Modify

### Backend (CMS.API)

| File | Action |
|------|--------|
| `Models/Partner.cs` | create |
| `Models/PartnerRequest.cs` | create |
| `Models/PartnerQuery.cs` | create |
| `Repositories/IPartnerRepository.cs` | create |
| `Repositories/PartnerRepository.cs` | create |
| `Controllers/PartnersController.cs` | create |
| `Repositories/ILookupRepository.cs` | modify (add `GetPartnersAsync`) |
| `Repositories/LookupRepository.cs` | modify (add `GetPartnersAsync`) |
| `Controllers/LookupsController.cs` | modify (add `GET partners`) |
| `Program.cs` | modify (register `IPartnerRepository`) |

### Frontend (CMS.NG)

| File | Action |
|------|--------|
| `core/models/partner.model.ts` | create |
| `core/services/partner.service.ts` | create |
| `features/partners/partner-list/partner-list.ts` (+ html/css) | create |
| `features/partners/partner-detail/partner-detail.ts` (+ html/css) | create |
| `features/partners/partner-form/partner-form.ts` (+ html/css) | create |
| `core/services/lookup.service.ts` | modify (add `getPartners`) |
| `app.routes.ts` | modify (add partner routes) |
| `app.ts` / `app.html` | modify (add 課程管理 group + Partner link) |

### Tests

| File | Action |
|------|--------|
| `CMS.API.Tests/PartnersControllerTests.cs` | create (list+filter, get found/not-found, create, update, delete) |
| `core/services/partner.service.spec.ts` | create (URL/verb per method) |
| `features/partners/partner-list/partner-list.spec.ts` | create |
| `features/partners/partner-detail/partner-detail.spec.ts` | create |
| `features/partners/partner-form/partner-form.spec.ts` | create (required-field enforcement) |
