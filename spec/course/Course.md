# Build Spec for Course
- database schema: `.\database\course.sql`

## Summary

`Course` is the central entity of the course sub-system: a training course offered by a partner.
It carries identity codes, scheduling dates, pricing and long-form descriptive content, and it is
the busiest table in the schema (**1,080 rows** in the dev DB). It has three outbound FKs
(`Partner`, `CourseGroup`, `PublishStatus` — all three feature pages already exist, so the
Foreign-Primary links are wired in this build) and two N-N relationships (`Certification`,
`JobCategory`). Three tables reference it as a child (`CourseFAQ`, `CourseRelatedLink`,
`HotCourse`) — none of those features exist yet, so their links are deferred.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **int** IDENTITY(1,1) — auto-generated, immutable |
| Foreign Keys | `Partner_pkid` → `Partner.pkid` (NOT NULL); `CourseGroup_pkid` → `CourseGroup.pkid` (**NULL**); `PublishStatus_pkid` → `PublishStatus.pkid` (NOT NULL) |
| Required Fields | `Title`, `CourseId`, `ProdCourseId`, `FriendlyUrl`, `DisplayOrder`, `Partner_pkid`, `PublishStatus_pkid`, `ScheduleOn`, `ScheduleOff`, `Hour`, `ListPrice`, `LearningCredit`, `CanRepeat` |
| N-N Relationships | `CourseInCertification` (↔ Certification), `CourseJobCategories` (↔ JobCategory) |
| Primary-Foreign Links | `CourseFAQ`, `CourseRelatedLink`, `HotCourse` — **all deferred** (features don't exist) |
| Query Filters | keyword; `Partner_pkid`; `CourseGroup_pkid`; `PublishStatus_pkid`; `ScheduleOn` range; `ScheduleOff` range; `CanRepeat` |
| Default Sort | **`CourseId ASC`** — see *Default Sort* below (not `DisplayOrder`) |

---

## Default Sort — why `CourseId ASC` and not `DisplayOrder ASC`

The template prefers `DisplayOrder ASC`, and `Course` *does* have a `DisplayOrder` column — but the
dev data shows it is **not a global ordering**:

| Measure | Value |
|---------|-------|
| Course rows | 1,080 |
| Distinct `DisplayOrder` values | **65** (range 0–1000) |
| Partner 1 alone | 243 courses across **21** distinct `DisplayOrder` values |

`DisplayOrder` is scoped/duplicated (~16 rows per value on average, and it stays ambiguous even
*within* one partner), so `ORDER BY DisplayOrder` would produce massive ties in arbitrary order.
`CourseId` is **unique across all 1,080 rows** (verified: zero duplicates) and is the natural
identifier users scan by. This also matches `spec/sample1.spec.md`, which specifies `CourseId ASC`.

> `DisplayOrder` is still exposed as a sortable list column and an editable form field — it is just
> not the *default* sort.

---

## Localization

### Chinese Table Name

- Course: 課程
- Description: 訓練課程主資料 — 課程代碼、原廠、上下架期間、定價與課程內容

### Chinese Column Names

Labels for the list columns are taken **verbatim from the supplied hints**; the remaining columns
are inferred. Note the hints intentionally differ from `spec/sample1.spec.md` (e.g. `CourseId` is
簡介代碼 here, not 課程代碼; `Partner` is 原廠, not 合作廠商) — **the hints win**.

| Column | Chinese label | Source |
|--------|---------------|--------|
| pkid | 主代碼 | hint |
| DisplayOrder | 顯示順序 | hint |
| CourseId | 簡介代碼 | hint |
| ProdCourseId | 科目代碼 | hint |
| Title | 課程名稱 | hint |
| Partner_pkid | 原廠 | hint (`partner.name`) |
| CourseGroup_pkid | 課程群組 | hint (`courseGroup.description`) |
| PublishStatus_pkid | 上架狀態 | hint (`publishStatus.description`) |
| ScheduleOn | 上架日期 | hint |
| ScheduleOff | 下架日期 | hint |
| Hour | 時數 | hint |
| ListPrice | 定價 | hint |
| LearningCredit | 點數 | hint |
| CanRepeat | 允許重聽 | hint |
| OfficialTitle | 正式課程名稱 | inferred |
| FriendlyUrl | 友善網址 | inferred |
| Material | 教材 | inferred |
| Objective | 課程目標 | inferred |
| Target | 適合對象 | inferred |
| Prerequisites | 先備知識 | inferred |
| Outline | 課程大綱 | inferred |
| TowardCertOrExam | 考試／認證說明 | inferred |
| Note | 備註 | inferred |
| OtherInfo | 其他資訊 | inferred |

---

## Required Fields

Required (NOT NULL, excluding the IDENTITY PK):

| Column | Type | Notes |
|--------|------|-------|
| `Title` | nvarchar(200) | |
| `CourseId` | varchar(50) | unique in practice; **no** UNIQUE constraint in the schema |
| `ProdCourseId` | varchar(50) | |
| `FriendlyUrl` | nvarchar(100) | |
| `DisplayOrder` | int | DEFAULT none — required |
| `Partner_pkid` | smallint | FK |
| `PublishStatus_pkid` | tinyint | FK |
| `ScheduleOn` | date | |
| `ScheduleOff` | date | |
| `Hour` | smallint | `DF_Course_Hour` DEFAULT 0 |
| `ListPrice` | decimal(9,0) | `DF_Course_ListPrice` DEFAULT 0 |
| `LearningCredit` | decimal(9,1) | `DF_Course_LearningCredits` DEFAULT 0 |
| `CanRepeat` | bit | `DF_Course_CanRepeat` DEFAULT 0 |

Optional (nullable):

`OfficialTitle` nvarchar(300), `CourseGroup_pkid` smallint, `Material` nvarchar(500),
`Objective` nvarchar(4000), `Target` nvarchar(500), `Prerequisites` nvarchar(4000),
`Outline` nvarchar(max), `TowardCertOrExam` nvarchar(max), `Note` nvarchar(4000),
`OtherInfo` nvarchar(4000).

> `CourseGroup_pkid` is nullable in the schema and **must** be treated as optional, even though the
> dev data currently has zero NULLs. The `LEFT JOIN` + null-nav path is verified below.

There are **no computed columns**.

---

## Foreign Keys

- **`Partner_pkid`** → `Partner.pkid` — `FK_Course_Partner`, NOT NULL
  - Alias as `PartnerPkid` in SELECT (DB column is `Partner_pkid`).
  - Option label = `Name`; order by `DisplayOrder ASC`.
  - Lookup: `GET /api/lookups/partners` (**exists**). 66 options → `[filter]="true"`.

- **`CourseGroup_pkid`** → `CourseGroup.pkid` — `FK_Course_CourseGroup`, **NULL** (allow「無」)
  - Alias as `CourseGroupPkid`.
  - Option label = `Description`; order by `pkid ASC`.
  - Lookup: `GET /api/lookups/course-groups` (**exists**). **214 options** →
    `[filter]="true"` **and** `[virtualScroll]="true" [virtualScrollItemSize]="43"` (100+ rule).

- **`PublishStatus_pkid`** → `PublishStatus.pkid` — `FK_Course_PublishStatus`, NOT NULL
  - Alias as `PublishStatusPkid`.
  - Option label = `Description`; order by `pkid ASC`.
  - Lookup: `GET /api/lookups/publish-statuses` (**exists**). 4 options → no filter.

> `FK_Course_CourseGroup` is `ON DELETE CASCADE`, but that cascade fires when a **CourseGroup** is
> deleted (deleting the courses). It has no effect on deleting a `Course`, which is what this
> feature does. Already documented in `spec/course/CourseGroup.md`.

---

## Foreign-Primary Links

All three FK targets already have detail pages in `app.routes.ts`, so — unlike CourseGroup's
deferred links — these **are wired in this build**.

- **`Partner_pkid`** → `/partners/{partnerPkid}` (always shown; NOT NULL)
- **`CourseGroup_pkid`** → `/course-groups/{courseGroupPkid}` — **only when not null**
- **`PublishStatus_pkid`** → `/publish-statuses/{publishStatusPkid}` (always shown; NOT NULL)

Shown on the detail page as links on the 原廠 / 課程群組 / 上架狀態 rows.

---

## Primary-Foreign Links

Tables with an FK to `Course.pkid`:

| Child table | FK | Cascade | Header | Button (icon) | Target route |
|-------------|----|---------|--------|---------------|--------------|
| `CourseFAQ` | `Course_pkid` | no | 對應課程問答 | 查看 FAQ (`pi pi-question-circle`) | `/course-faqs?coursePkid={pkid}` |
| `CourseRelatedLink` | `Course_pkid` | no | 對應相關連結 | 查看相關連結 (`pi pi-link`) | `/course-related-links?coursePkid={pkid}` |
| `HotCourse` | `Course_pkid` | no | 對應熱門課程 | 查看熱門課程 (`pi pi-star`) | `/hot-courses?coursePkid={pkid}` |

> **Deferred in this build.** None of `course-faqs`, `course-related-links` or `hot-courses` exists
> in `app.routes.ts`. Per CLAUDE.md ("Don't wire links to routes that don't exist yet"), these
> buttons are **omitted from the generated code** and recorded here for whoever builds those
> features next.

`CourseInCertification` and `CourseJobCategories` also FK to `Course.pkid`, but they are junction
tables managed inline — see *N-N Relationships*.

### Not a Primary-Foreign link: `CourseRecomm`

`CourseRecomm` (`CourseId`, `RecommCourseId`, `CourseOrder`) *looks* like a child of Course, but it
references `Course.CourseId` (varchar) **with no FOREIGN KEY constraint declared** in
`database/course.sql`. It is not enforced by the DB, does not participate in the 547 delete path,
and is out of scope here. `spec/sample1.spec.md` lists it as a Course child — that is the sample's
fuller schema, not this one.

---

## N-N Relationships

Both junction tables qualify under the rule in `spec/reference/backend.md` — *exactly two FK
columns and nothing else*:

### CourseInCertification — Course ↔ Certification

| Column | Type | Notes |
|--------|------|-------|
| `Course_pkid` | int NOT NULL | FK → Course.pkid, `ON UPDATE CASCADE ON DELETE CASCADE` |
| `Certification_pkid` | int NOT NULL | FK → Certification.pkid |

- Request field: `CertificationPkids` — `List<int>`. Populated on GET-by-pkid.
- Form: `p-multiSelect`, `[maxSelectedLabels]="9999"`. 39 options → `[filter]="true"`, no virtual scroll.
- Detail: show the certification labels, not raw ids.
- Lookup: `GET /api/lookups/certifications` (**new**).
  - ⚠️ **`Certification.Title` is `nchar(100)`** — verified padded to a full 100 chars in the dev DB
    (`[Microsoft Certified Technology Speclist                    …]`). It **must** be `RTRIM()`-ed
    or every option label carries ~50 trailing spaces.
  - Label = `p.Name + ' - ' + RTRIM(c.Title)` — `Title` alone is ambiguous across partners.
  - Order by `p.DisplayOrder ASC, c.Title ASC` (qualified — see the ORDER BY hazard below).

### CourseJobCategories — Course ↔ JobCategory

| Column | Type | Notes |
|--------|------|-------|
| `Course_pkid` | int NOT NULL | FK → Course.pkid, `ON UPDATE CASCADE ON DELETE CASCADE` |
| `JobCategory_pkid` | smallint NOT NULL | FK → JobCategory.pkid |

- Request field: `JobCategoryPkids` — `List<short>`.
- Form: `p-multiSelect`. 18 options → `[filter]="true"`.
- Lookup: `GET /api/lookups/job-categories` (**new**). Label = `Description`; order by `pkid ASC`.
  `JobCategory.Description` is `nvarchar(70)` → no RTRIM.

### Sync pattern (create & update)

Delete-then-reinsert inside the **same transaction** as the main write, mirroring
`AppRoleRepository.ReplaceUsersAsync`:

```sql
DELETE FROM CourseInCertification WHERE Course_pkid = @Pkid;
INSERT INTO CourseInCertification (Course_pkid, Certification_pkid) VALUES (@Pkid, @CertificationPkid);
-- same shape for CourseJobCategories / JobCategory_pkid
```

Distinct + empty-list guard before insert (as `ReplaceUsersAsync` does).

---

## Query Filters

- **keyword**: string — LIKE on `Title`, `OfficialTitle`, `CourseId`, `ProdCourseId`, `FriendlyUrl`.
  Deliberately **excludes** the large text columns (`Objective`/`Prerequisites`/`Note`/`OtherInfo`
  nvarchar(4000), `Outline`/`TowardCertOrExam` nvarchar(max), `Material`/`Target` nvarchar(500))
  per the template rule — slow and rarely useful.
- **PartnerPkid**: `short?` — exact match. Lookup `partners`, label `Name`, order `DisplayOrder ASC`.
- **CourseGroupPkid**: `short?` — exact match. Lookup `course-groups`, label `Description`, order `pkid ASC`.
- **PublishStatusPkid**: `byte?` — exact match. Lookup `publish-statuses`, label `Description`, order `pkid ASC`.
- **ScheduleOnFrom / ScheduleOnTo**: `DateOnly?` — `ScheduleOn >= @From`, `ScheduleOn <= @To` (both inclusive).
- **ScheduleOffFrom / ScheduleOffTo**: `DateOnly?` — `ScheduleOff >= @From`, `ScheduleOff <= @To` (both inclusive).
- **CanRepeat**: `bool?` — tri-state (null = no filter / true / false).

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/partners` | **Exists** | label = `Name`, order `DisplayOrder ASC` |
| `GET /api/lookups/course-groups` | **Exists** | label = `Description`, order `g.pkid ASC` |
| `GET /api/lookups/publish-statuses` | **Exists** | label = `Description`, order `s.pkid ASC` |
| `GET /api/lookups/certifications` | **New** | label = `Partner.Name + ' - ' + RTRIM(Title)`, order `p.DisplayOrder, c.Title` |
| `GET /api/lookups/job-categories` | **New** | label = `Description`, order `j.pkid ASC` |

> **ORDER BY alias-shadowing hazard applies to both new lookups.** `LookupItem.Pkid` is a `string`,
> so the numeric PK is cast (`CAST(c.pkid AS varchar(10)) AS Pkid`). SQL Server binds an
> *unqualified* `ORDER BY pkid` to the varchar select-list alias, sorting lexicographically
> (`1, 10, 100, 2`). **Always alias the table and qualify**: `FROM JobCategory j … ORDER BY j.pkid ASC`.
> This is the bug that hit `publish-statuses` in production (see CLAUDE.md).

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/courses` | List all (ORDER BY `CourseId ASC`) |
| `POST` | `/api/courses/query` | Filtered query (body: `CourseQuery`); null body → empty query |
| `GET` | `/api/courses/{id}` | Get by int pkid — includes N-N lists; 404 if missing |
| `POST` | `/api/courses` | Create — 201 + `Location`; 400 on invalid model |
| `PUT` | `/api/courses` | Update (pkid from body, no route param) — 204 / 404 / 400 |
| `DELETE` | `/api/courses/{id}` | Delete — 204 / 404 / **409** on FK violation |

`pkid` is numeric → no `encodeURIComponent`; the Angular service takes a `number`.
**No `/copy` endpoint** — `spec/sample1.spec.md` describes one, but it is not requested here and no
existing controller has a special action. Out of scope. No auth attributes (consistent with the
existing controllers).

---

## Backend Notes

### ⚠️ `DateOnly` requires a Dapper type handler — verified, not assumed

`Course` is the **first** table in this codebase with `date` columns, so the handler had to be
written for this build (see `spec/reference/backend.md`). Probed against the dev DB with the exact
pinned versions (Dapper 2.1.79 + Microsoft.Data.SqlClient 7.0.2) — **native support is absent in
both directions**:

```
READ FAIL:  DataException: Error parsing column 1 (ScheduleOn=2015/11/10 - DateTime)
PARAM FAIL: NotSupportedException: The member From of type System.DateOnly
            cannot be used as a parameter value
```

With the handler below registered, all paths pass (read, non-null param, null param, and a real
INSERT round-trip):

```
READ OK  pkid=35 ScheduleOn=2015/11/10 ScheduleOff=2021/11/1
PARAM OK  count=1080
NULLABLE(null) PARAM OK  count=1080
NULLABLE(value) PARAM OK  count=1068
INSERT ROUND-TRIP OK  pkid=3341 ScheduleOn=2026/3/1 ScheduleOff=2036/3/1
```

New file `Data/DateOnlyTypeHandler.cs`, registered in `Program.cs` **before** `builder.Build()`:

```csharp
public sealed class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public override DateOnly Parse(object value) => DateOnly.FromDateTime((DateTime)value);

    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.DbType = DbType.Date;
        parameter.Value = value.ToDateTime(TimeOnly.MinValue);
    }
}
// Program.cs:  SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
```

`SqlMapper.AddTypeHandler<T>` covers both `DateOnly` and `DateOnly?` (the nullable query-filter
params are verified above). **No `TimeOnly` handler** — `Course` has no `time` columns.

### Models

```csharp
// Models/Course.cs
public class Course
{
    public int Pkid { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? OfficialTitle { get; set; }
    public string CourseId { get; set; } = string.Empty;
    public string ProdCourseId { get; set; } = string.Empty;
    public string FriendlyUrl { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public short PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte PublishStatusPkid { get; set; }
    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    public short Hour { get; set; }
    public decimal ListPrice { get; set; }
    public decimal LearningCredit { get; set; }
    public string? Material { get; set; }
    public string? Objective { get; set; }
    public string? Target { get; set; }
    public string? Prerequisites { get; set; }
    public string? Outline { get; set; }
    public string? TowardCertOrExam { get; set; }
    public string? Note { get; set; }
    public string? OtherInfo { get; set; }
    public bool CanRepeat { get; set; }

    // FK nav objects (multi-map). CourseGroup is null when CourseGroup_pkid IS NULL.
    public CoursePartnerRef? Partner { get; set; }
    public CourseGroupRef? CourseGroup { get; set; }
    public CoursePublishStatusRef? PublishStatus { get; set; }

    // Populated on GET by pkid only (not on list/query).
    public List<int> CertificationPkids { get; set; } = [];
    public List<short> JobCategoryPkids { get; set; } = [];
}

public sealed class CoursePartnerRef      { public short Pkid { get; set; } public string Name { get; set; } = string.Empty; }
public sealed class CourseGroupRef        { public short Pkid { get; set; } public string Description { get; set; } = string.Empty; }
public sealed class CoursePublishStatusRef{ public byte  Pkid { get; set; } public string Description { get; set; } = string.Empty; }
```

> Nav types are named `Course*Ref` to avoid colliding with the existing top-level `Partner` /
> `CourseGroup` / `PublishStatus` models in the same `CMS.API.Models` namespace. `CourseGroupRef`
> needs no prefix — there is no clash.

```csharp
// Models/CourseRequest.cs — pkid is IDENTITY: 0 on create, the key on update.
public class CourseRequest
{
    public int Pkid { get; set; }

    [Required, MaxLength(200)]  public string Title { get; set; } = string.Empty;
    [MaxLength(300)]            public string? OfficialTitle { get; set; }
    [Required, MaxLength(50)]   public string CourseId { get; set; } = string.Empty;
    [Required, MaxLength(50)]   public string ProdCourseId { get; set; } = string.Empty;
    [Required, MaxLength(100)]  public string FriendlyUrl { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public short PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte PublishStatusPkid { get; set; }
    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    public short Hour { get; set; }
    public decimal ListPrice { get; set; }
    public decimal LearningCredit { get; set; }
    [MaxLength(500)]  public string? Material { get; set; }
    [MaxLength(4000)] public string? Objective { get; set; }
    [MaxLength(500)]  public string? Target { get; set; }
    [MaxLength(4000)] public string? Prerequisites { get; set; }
    public string? Outline { get; set; }            // nvarchar(max) — no MaxLength
    public string? TowardCertOrExam { get; set; }   // nvarchar(max) — no MaxLength
    [MaxLength(4000)] public string? Note { get; set; }
    [MaxLength(4000)] public string? OtherInfo { get; set; }
    public bool CanRepeat { get; set; }

    public List<int> CertificationPkids { get; set; } = [];
    public List<short> JobCategoryPkids { get; set; } = [];
}
```

> `PartnerPkid` / `PublishStatusPkid` are NOT NULL FKs but are **value types**, so `[Required]` is a
> no-op on them (a missing JSON field binds to 0, not null). A bad value is caught by the FK
> constraint → 547 → 409, consistent with how the rest of the codebase handles FK violations.

```csharp
// Models/CourseQuery.cs
public class CourseQuery
{
    /// <summary>LIKE on Title, OfficialTitle, CourseId, ProdCourseId, FriendlyUrl.</summary>
    public string? Keyword { get; set; }
    public short? PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte? PublishStatusPkid { get; set; }
    public DateOnly? ScheduleOnFrom { get; set; }
    public DateOnly? ScheduleOnTo { get; set; }
    public DateOnly? ScheduleOffFrom { get; set; }
    public DateOnly? ScheduleOffTo { get; set; }
    public bool? CanRepeat { get; set; }
}
```

### SQL — SELECT (multi-map, verified)

No `nchar` columns on `Course` itself → **no RTRIM** here (the RTRIM is needed in the
`certifications` *lookup*). Each nav block starts with a column literally aliased `Pkid` so
`splitOn: "Pkid,Pkid,Pkid"` lands on the right boundaries — Dapper searches from `startIdx + 1`, so
`c.pkid AS Pkid` at index 0 is correctly skipped.

```sql
SELECT c.pkid AS Pkid, c.Title, c.OfficialTitle, c.CourseId, c.ProdCourseId, c.FriendlyUrl,
       c.DisplayOrder,
       c.Partner_pkid AS PartnerPkid, c.CourseGroup_pkid AS CourseGroupPkid,
       c.PublishStatus_pkid AS PublishStatusPkid,
       c.ScheduleOn, c.ScheduleOff, c.Hour, c.ListPrice, c.LearningCredit,
       c.Material, c.Objective, c.Target, c.Prerequisites, c.Outline,
       c.TowardCertOrExam, c.Note, c.OtherInfo, c.CanRepeat,
       p.pkid AS Pkid, p.Name,
       g.pkid AS Pkid, g.Description,
       s.pkid AS Pkid, s.Description
FROM Course c
INNER JOIN Partner p       ON p.pkid = c.Partner_pkid
LEFT  JOIN CourseGroup g   ON g.pkid = c.CourseGroup_pkid
INNER JOIN PublishStatus s ON s.pkid = c.PublishStatus_pkid
ORDER BY c.CourseId ASC;
```

`QueryAsync<Course, CoursePartnerRef, CourseGroupRef, CoursePublishStatusRef, Course>(…, splitOn: "Pkid,Pkid,Pkid")`.

**Verified against the dev DB**: when `CourseGroup_pkid IS NULL`, Dapper yields a genuinely `null`
`CourseGroup` nav object (not a zero-filled instance), so **no manual null-coalescing is needed** in
the map lambda. Tested by forcing a NULL inside a transaction and rolling back.

`GetByIdAsync` uses the same SELECT with `WHERE c.pkid = @pkid`, then issues two follow-up queries
**on the same connection** to fill the N-N lists:

```sql
SELECT Certification_pkid FROM CourseInCertification WHERE Course_pkid = @pkid ORDER BY Certification_pkid;
SELECT JobCategory_pkid   FROM CourseJobCategories   WHERE Course_pkid = @pkid ORDER BY JobCategory_pkid;
```

### SQL — INSERT

`pkid` is IDENTITY → excluded. No computed columns to exclude.

```sql
INSERT INTO Course (Title, OfficialTitle, CourseId, ProdCourseId, FriendlyUrl, DisplayOrder,
    Partner_pkid, CourseGroup_pkid, PublishStatus_pkid, ScheduleOn, ScheduleOff, Hour,
    ListPrice, LearningCredit, Material, Objective, Target, Prerequisites, Outline,
    TowardCertOrExam, Note, OtherInfo, CanRepeat)
VALUES (@Title, @OfficialTitle, @CourseId, @ProdCourseId, @FriendlyUrl, @DisplayOrder,
    @PartnerPkid, @CourseGroupPkid, @PublishStatusPkid, @ScheduleOn, @ScheduleOff, @Hour,
    @ListPrice, @LearningCredit, @Material, @Objective, @Target, @Prerequisites, @Outline,
    @TowardCertOrExam, @Note, @OtherInfo, @CanRepeat);
SELECT CAST(SCOPE_IDENTITY() AS int);
```

Then sync both junctions, all inside one transaction; `CreateAsync` re-reads via `GetByIdAsync` so
the response carries the nav objects.

### SQL — UPDATE

Same column list; `pkid` is the immutable key. Then re-sync both junctions in the same transaction.

```sql
UPDATE Course SET Title = @Title, …, CanRepeat = @CanRepeat WHERE pkid = @Pkid;
```

### SQL — DELETE

```sql
DELETE FROM Course WHERE pkid = @pkid;
```

**Cascade map for deleting a Course** (read from the FK definitions, per CLAUDE.md):

| Child | Cascade? | Effect on delete |
|-------|----------|------------------|
| `CourseInCertification` | `ON DELETE CASCADE` | silently removed |
| `CourseJobCategories` | `ON DELETE CASCADE` | silently removed |
| `CourseFAQ` | none | **blocks** → 547 |
| `CourseRelatedLink` | none | **blocks** → 547 |
| `HotCourse` | none | **blocks** → 547 |

The two junctions cascade, so — unlike `AppRoleRepository.DeleteAsync`, which must hand-delete
`AppUserRole` — **no explicit junction cleanup is needed**. The three non-cascading children raise
`SqlException` 547 → controller returns **409** with a Traditional-Chinese message, mirroring
`PartnersController.Delete`:

> `此課程仍被課程問答、相關連結或熱門課程使用，無法刪除。`

Because the junction rows vanish silently, the delete confirmation must **not** claim the delete is
isolated — see *Delete Confirmation*.

---

## Frontend Notes

### Route table

| Route | Component |
|-------|-----------|
| `/courses` | `CourseList` |
| `/courses/new` | `CourseForm` (add mode) |
| `/courses/:id` | `CourseDetail` |
| `/courses/:id/edit` | `CourseForm` (edit mode) |

`new` is declared **before** `:id`.

### Angular model

```ts
export interface CoursePartnerRef { pkid: number; name: string; }
export interface CourseGroupRef { pkid: number; description: string; }
export interface CoursePublishStatusRef { pkid: number; description: string; }

export interface Course {
  pkid: number;
  title: string;
  officialTitle: string | null;
  courseId: string;
  prodCourseId: string;
  friendlyUrl: string;
  displayOrder: number;
  partnerPkid: number;
  courseGroupPkid: number | null;
  publishStatusPkid: number;
  scheduleOn: string;            // ISO date (yyyy-MM-dd) — DateOnly serializes without a time part
  scheduleOff: string;
  hour: number;
  listPrice: number;
  learningCredit: number;
  material: string | null;
  objective: string | null;
  target: string | null;
  prerequisites: string | null;
  outline: string | null;
  towardCertOrExam: string | null;
  note: string | null;
  otherInfo: string | null;
  canRepeat: boolean;
  partner: CoursePartnerRef | null;
  courseGroup: CourseGroupRef | null;
  publishStatus: CoursePublishStatusRef | null;
  certificationPkids: number[];
  jobCategoryPkids: number[];
}
```

`CourseRequest` mirrors the write DTO (`scheduleOn` / `scheduleOff` as `yyyy-MM-dd` strings).
`CourseQuery` carries `keyword`, the three FK pkids, the four date bounds, and `canRepeat`.

### Date handling

`DateOnly` serializes as a plain `yyyy-MM-dd` string with **no time part and no timezone**, so the
UTC-suffix trick in the template (`dt + 'Z'`) does **not** apply — that is for `datetime` columns,
and `Course` has none.

The real hazard is the reverse: converting the `p-datepicker`'s `Date` back to `yyyy-MM-dd`.
`d.toISOString().split('T')[0]` converts to UTC first and is **off by one day for UTC+8 users**
(a date picked as 2026-03-01 00:00 local serializes as 2026-02-28). Use local components instead.
`core/utils/date.util.ts` does not exist yet — **create it** with:

```ts
/** yyyy-MM-dd from LOCAL date parts. Never use toISOString() — it shifts UTC+8 back a day. */
export function toIso(d: Date): string { … }        // getFullYear/getMonth()+1/getDate()
/** Parse an API yyyy-MM-dd into a local midnight Date. */
export function fromIso(s: string | null): Date | null { … }  // new Date(y, m-1, d)
export function addYears(d: Date, n: number): Date { … }
```

`fromIso` must build via `new Date(y, m-1, d)`, not `new Date('2026-03-01')` — the latter parses as
**UTC** midnight and renders as the previous day in UTC+8.

### List component

Columns, in the supplied order (all sortable):

| # | Header | Field | Width |
|---|--------|-------|-------|
| 1 | 主代碼 | `pkid` | 6rem |
| 2 | 顯示順序 | `displayOrder` | 7rem |
| 3 | 簡介代碼 | `courseId` | 9rem |
| 4 | 科目代碼 | `prodCourseId` | 9rem |
| 5 | 課程名稱 | `title` | — |
| 6 | 原廠 | `partner.name` | — |
| 7 | 課程群組 | `courseGroup.description` | — |
| 8 | 上架狀態 | `publishStatus.description` | 8rem |
| 9 | 上架日期 | `scheduleOn` | 8rem |
| 10 | 下架日期 | `scheduleOff` | 8rem |
| 11 | 時數 | `hour` | 6rem |
| 12 | 定價 | `listPrice` | 8rem |
| 13 | 點數 | `learningCredit` | 6rem |
| 14 | 允許重聽 | `canRepeat` | 7rem |
| 15 | 操作 | — | 9rem |

- FK columns bind to the **nav objects** (`course.partner?.name`), so the list needs **no lookup
  `forkJoin`** to render labels — the JOIN already resolved them. Lookups are loaded only to
  populate the filter drawer's dropdowns.
- `p-table` `pSortableColumn="partner.name"` sorts on the nested field (PrimeNG resolves dotted paths).
- `courseGroup.description` renders `—` when null.
- `canRepeat` renders as 是 / 否.
- `listPrice` → `| number`; `scheduleOn`/`scheduleOff` → `| date:'yyyy/MM/dd'`.
- Default sort `sortField = 'courseId'`, `sortOrder = 1`. Default `rows = 20`.
- 16 columns is wide → wrap the table in `.table-scroll { overflow-x: auto }`.

Filter drawer (`p-drawer`, position right):

| Control | Field | Widget |
|---------|-------|--------|
| 關鍵字 | `keyword` | `input pInputText` (課程名稱／簡介代碼／科目代碼／友善網址) |
| 原廠 | `partnerPkid` | `p-select` `appendTo="body"` `[filter]="true"` (66) |
| 課程群組 | `courseGroupPkid` | `p-select` `appendTo="body"` `[filter]="true"` `[virtualScroll]="true"` `[virtualScrollItemSize]="43"` (214) |
| 上架狀態 | `publishStatusPkid` | `p-select` `appendTo="body"` (4) |
| 上架日期 | `scheduleOnFrom` / `scheduleOnTo` | two `p-datepicker` |
| 下架日期 | `scheduleOffFrom` / `scheduleOffTo` | two `p-datepicker` |
| 允許重聽 | `canRepeat` | `p-select` 不限 / 是 / 否 (tri-state) |

Lookup pkids arrive as **strings** (`LookupItem.pkid`) but the query DTO wants numbers → map to
`{ pkid: number, label }` in a getter before binding, and `Number(...)` on apply.

### Form layout

| Field | Widget | Notes |
|-------|--------|-------|
| 主代碼 `pkid` | `p-inputNumber` `[useGrouping]="false"` | edit mode only; **disabled** (IDENTITY) |
| 課程名稱 `title` | `input pInputText` maxlength 200 | required |
| 正式課程名稱 `officialTitle` | `input pInputText` maxlength 300 | optional |
| 簡介代碼 `courseId` | `input pInputText` maxlength 50 | required |
| 科目代碼 `prodCourseId` | `input pInputText` maxlength 50 | required |
| 友善網址 `friendlyUrl` | `input pInputText` maxlength 100 | required |
| 顯示順序 `displayOrder` | `p-inputNumber` `[useGrouping]="false"` | required |
| 原廠 `partnerPkid` | `p-select` `[filter]="true"` appendTo body | required |
| 課程群組 `courseGroupPkid` | `p-select` `[showClear]="true"` `[filter]="true"` `[virtualScroll]="true"` | **optional** (nullable FK) |
| 上架狀態 `publishStatusPkid` | `p-select` appendTo body | required |
| 上架日期 `scheduleOn` | `p-datepicker` `dateFormat="yy/mm/dd"` | required |
| 下架日期 `scheduleOff` | `p-datepicker` | required; auto-defaults (below) |
| 時數 `hour` | `p-inputNumber` `[min]="0"` | required, default 0 |
| 定價 `listPrice` | `p-inputNumber` `[min]="0"` `[maxFractionDigits]="0"` | required, default 0 — decimal(9,**0**) |
| 點數 `learningCredit` | `p-inputNumber` `[min]="0"` `[minFractionDigits]="1" [maxFractionDigits]="1"` | required, default 0 — decimal(9,**1**) |
| 允許重聽 `canRepeat` | `p-checkbox` `[binary]="true"` | default false |
| 教材 `material` | `textarea pTextarea` maxlength 500 | optional |
| 課程目標 `objective` | `textarea` maxlength 4000 | optional |
| 適合對象 `target` | `textarea` maxlength 500 | optional |
| 先備知識 `prerequisites` | `textarea` maxlength 4000 | optional |
| 課程大綱 `outline` | `textarea` rows 8 | optional, nvarchar(max) → **no maxlength** |
| 考試／認證說明 `towardCertOrExam` | `textarea` rows 6 | optional, nvarchar(max) → **no maxlength** |
| 備註 `note` | `textarea` maxlength 4000 | optional |
| 其他資訊 `otherInfo` | `textarea` maxlength 4000 | optional |
| 認證 `certificationPkids` | `p-multiSelect` `[maxSelectedLabels]="9999"` `[filter]="true"` | N-N, optional |
| 職務類別 `jobCategoryPkids` | `p-multiSelect` `[maxSelectedLabels]="9999"` `[filter]="true"` | N-N, optional |

### Form shell — tabbed (`p-tabs`)

The 24 fields are grouped into **four tabs** (`primeng/tabs`, PrimeNG 20.4:
`p-tabs [(value)]` › `p-tablist` › `p-tab` › `p-tabpanels` › `p-tabpanel`):

| Tab | value | Fields |
|-----|-------|--------|
| 基本資料 | `basic` | pkid, title, officialTitle, courseId, prodCourseId, friendlyUrl, displayOrder |
| 上架與價格 | `publish` | partnerPkid, courseGroupPkid, publishStatusPkid, scheduleOn, scheduleOff, hour, listPrice, learningCredit, canRepeat |
| 課程內容 | `content` | material, objective, target, prerequisites, outline, towardCertOrExam, note, otherInfo |
| 關聯 | `relations` | certificationPkids, jobCategoryPkids |

> ⚠️ **Tabs hide validation errors.** Every required field lives on 基本資料 or 上架與價格, so a
> failed save can leave the user staring at a tab with nothing visibly wrong. Two mitigations are
> **required**, since no other feature in this codebase uses tabs:
> 1. **Error badge per tab** — each `p-tab` renders a `pi pi-exclamation-circle` marker when any
>    control in that tab's group is invalid *and* touched (`tabInvalid(tab)` helper backed by a
>    static tab→controls map).
> 2. **Auto-focus the offending tab** — `save()` on an invalid form calls `markAllAsTouched()` then
>    sets `activeTab` to the **first** tab containing an invalid control, so the error is on screen
>    before the warn toast fires.
>
> Do **not** set `[lazy]="true"` — panels must stay rendered so `p-datepicker`/`p-select` controls
> initialise and the error badges are accurate on first paint.

`forkJoin` loads the five lookups + (edit mode) the course in parallel.

### Special form behaviors

- **`ScheduleOff` auto-default** (from `spec/sample1.spec.md`): when `scheduleOn` changes via
  `valueChanges`, set `scheduleOff = scheduleOn + 10 years` using `addYears()`, with
  `{ emitEvent: false }` to avoid a subscription loop. Only fire when the new value is a `Date`.
  In edit mode, `patchValue` applies `scheduleOff` **after** `scheduleOn` so the loaded value wins.
- Numeric FK/query round-trip: `LookupItem.pkid` is a string; convert with `Number(...)` on save.
- `pkid` is `disable()`d → the form must read via `getRawValue()`.

### Delete Confirmation Message

The two junctions cascade silently, so the copy says so rather than implying an isolated delete:

```
確定要刪除主代碼 <b>${item.pkid}</b>「${item.courseId} ${item.title}」？
此課程的認證與職務類別關聯將一併被刪除。
```

Error toast on 409: `此課程仍被課程問答、相關連結或熱門課程使用，無法刪除。`

### Session Storage Keys

| Key | Contents |
|-----|----------|
| `course-list-filters` | `{ keyword, partnerPkid, courseGroupPkid, publishStatusPkid, scheduleOnFrom, scheduleOnTo, scheduleOffFrom, scheduleOffTo, canRepeat }` |
| `course-list-sort` | `{ sortField, sortOrder }` |
| `course-list-page` | `{ first, rows }` |

**Incoming query params.** `spec/course/CourseGroup.md` already specifies a deferred
`/courses?courseGroupPkid={pkid}` link, and Partner may later link `/courses?partnerPkid={pkid}`.
This list accepts **`courseGroupPkid`** and **`partnerPkid`** query params; when present they
**override** the saved filter state and are applied before the first `query()`.

Dates are persisted to sessionStorage as `yyyy-MM-dd` strings and revived via `fromIso()`.

### Detail component

`dl.detail-grid` grouped into the same four cards. 原廠 / 課程群組 / 上架狀態 render as
**router links** to the existing detail pages (課程群組 only when non-null). N-N shows resolved
labels (loaded via the two lookups). Toolbar: 返回 / 編輯. No Primary-Foreign buttons (deferred).

### Detail — QR Code

Lives in the **基本資料** card, beside the field list (`.basic-layout` flex; it drops below the list
on a narrow viewport). Generated client-side on course load — there is no QR endpoint.

| Item | Value |
|------|-------|
| Encodes | `{environment.publicSiteUrl}/Course/Show/{pkid}/{encodeURIComponent(courseId)}` |
| Title | `courseId` — HTML caption on the page, **and** drawn into the downloaded PNG |
| Download | `下載 QR Code` → composited PNG named `{courseId.trim()}.png` |

**Base URL is `environment.publicSiteUrl`** (`https://www.uuu.com.tw` in both env files), *not*
`apiUrl` — it points at the public course site, not this API. Kept out of the component so the
domain is swappable.

#### ⚠️ `CourseId` is not URL-safe — `encodeURIComponent` is mandatory

Verified against the dev DB: **15 of the 1,080 rows** hold characters outside `[A-Za-z0-9._-]` —
spaces (`AIteam-Open Source`), **trailing** spaces (pkid 2103 = `23aiNFA `), parentheses
(`DO180(NO)`), and one CJK value (pkid 1319 = `Python-程式設計開發應用`). Raw interpolation would
emit a broken URL for those rows. `pkid` is an int and needs no encoding.

The QR encodes the **stored value verbatim** — `23aiNFA ` becomes `.../2103/23aiNFA%20`, not a
trimmed variant, so the QR always resolves to exactly the CourseId the record holds. The *filename*
is the one place that trims, since a trailing space does not survive a filesystem anyway.

> Verified end-to-end by generating and **decoding** the QR for all five awkward rows: each scans
> back to the intended URL, including the CJK one (`%E7%A8%8B…`) and the trailing space. The
> composited PNG (caption drawn on) still scans — the caption band does not intrude on the symbol.

#### Library

`qrcode` (node-qrcode) **1.5.4** + `@types/qrcode`. PrimeNG v20 has **no** QR component (v21 added
one, but that needs Angular 21 — see the v20 pin in `spec/reference/frontend.md`). `qrcode` was
chosen over `angularx-qrcode` precisely because it is framework-agnostic: its version does not track
Angular's, so it cannot repeat the PrimeNG-v21 pinning trap.

It is **CommonJS**, so it must be listed in `angular.json` → `allowedCommonJsDependencies`,
otherwise every prod build prints an optimization-bailout warning. It costs the initial bundle
**nothing** — it resolves into the lazy `course-detail` chunk (34 kB).

Options: `{ errorCorrectionLevel: 'M', margin: 2, width: 220 }`.

#### Canvas compositing

The on-page QR is **bare** (`toDataURL`) with the caption as HTML; the download composites via
`toCanvas` onto a canvas `CAPTION_BAND_PX` (34) taller, then draws the caption centred in the band:

- **Paint the white background first.** `qrcode`'s own margin is *transparent*, so a PNG saved
  without the `fillRect` carries a transparent surround — which renders black in many image viewers
  and can defeat scanners that rely on the quiet zone.
- `fillText`'s **`maxWidth`** argument is passed (`canvas.width - 16`): CourseId runs to 18 chars in
  the dev data, which overflows 220 px at 16 px bold. `maxWidth` condenses instead of overflowing.

### Sub-panels (edit mode only)

**N/A** — `spec/sample1.spec.md` describes `CourseRelatedLink` / `CourseRecomm` inline sub-panels,
but neither feature exists and `spec/inline-edit.md` is not in this repo. Out of scope.

### Sidebar placement

Existing group **課程管理 Course** (holds 合作廠商 Partner, 課程群組 CourseGroup).
Add child: `{ label: '課程', labelEn: 'Course', icon: 'pi pi-book', route: '/courses' }`.

---

## Tests

### Backend — `CMS.API.Tests/CoursesControllerTests.cs`

Mock `ICourseRepository` with `MockBehavior.Strict`; no live DB. Mirrors `CourseGroupsControllerTests`:

- `GetAll` → 200 with items
- `Query` → passes each filter through; null body → empty query
- `GetById` found → 200 (incl. nav objects + N-N lists) / missing → 404
- `Create` valid → `CreatedAtAction` with `RouteValues["id"]`; invalid model → 400, repo never called
- `Update` existing → 204 / missing → 404 / invalid model → 400, repo never called
- `Delete` existing → 204 / missing → 404

> **Known gap** (see `spec/reference/backend.md`). `SqlException` has no public constructor, so a
> mocked repo cannot throw
> it — the **547 → 409** delete path is *not* unit-testable and must be verified against the dev DB.

### Frontend

- `core/services/course.service.spec.ts` — `HttpTestingController`; URL + verb for `getAll`, `query`,
  `getById`, `create`, `update`, `delete`, and the five lookup getters. pkid is numeric → **no
  `encodeURIComponent` assertion**.
- `core/utils/date.util.spec.ts` — **`toIso()` must not shift the day** (the UTC+8 off-by-one);
  `fromIso()` round-trips; `addYears()`.
- `course-list.spec.ts` — loads via `query` on init; renders nav-object labels; incoming
  `courseGroupPkid` param overrides saved filters; applyFilters persists + re-queries; clear resets.
- `course-detail.spec.ts` — loads by numeric id; renders nav links; null courseGroup renders `—`.
  **QR:** builds the URL from pkid/courseId; percent-encodes an unsafe courseId and does **not**
  trim it; renders the image + caption; download produces a `data:image/png` named
  `{courseId}.png`. The compositing test decodes the PNG and asserts **real ink in the caption
  band** — an assertion on canvas height alone passes against a blank band (confirmed by mutating
  out the `fillText`).
- `course-form.spec.ts` — add mode invalid until required fields filled; create sends `pkid: 0`;
  `scheduleOff` auto-defaults to +10y on `scheduleOn` change; edit mode patches, keeps `pkid`
  disabled, and the loaded `scheduleOff` survives the auto-default subscription.
  **Tab-specific:** an invalid save switches `activeTab` to the first tab holding an invalid
  control; `tabInvalid()` flags the right tab.

---

## Files to Create / Modify

### Backend (`src/CMS.API`)

| File | Action |
|------|--------|
| `Data/DateOnlyTypeHandler.cs` | **Create** — first `date` columns in the codebase |
| `Models/Course.cs` | Create (incl. the three `*Ref` nav types) |
| `Models/CourseRequest.cs` | Create |
| `Models/CourseQuery.cs` | Create |
| `Repositories/ICourseRepository.cs` | Create |
| `Repositories/CourseRepository.cs` | Create |
| `Controllers/CoursesController.cs` | Create |
| `Repositories/ILookupRepository.cs` | Modify — add `GetCertificationsAsync`, `GetJobCategoriesAsync` |
| `Repositories/LookupRepository.cs` | Modify — implement both (RTRIM + qualified ORDER BY) |
| `Controllers/LookupsController.cs` | Modify — add `certifications`, `job-categories` |
| `Program.cs` | Modify — register `ICourseRepository` + `SqlMapper.AddTypeHandler(new DateOnlyTypeHandler())` |

### Frontend (`src/CMS.NG`)

| File | Action |
|------|--------|
| `core/utils/date.util.ts` | **Create** — `toIso`, `fromIso`, `addYears` |
| `core/models/course.model.ts` | Create |
| `core/services/course.service.ts` | Create |
| `features/courses/course-list/{ts,html,scss}` | Create |
| `features/courses/course-detail/{ts,html,scss}` | Create — incl. the QR panel |
| `features/courses/course-form/{ts,html,scss}` | Create |
| `app.routes.ts` | Modify — add lazy `courses` routes (`new` before `:id`) |
| `app.ts` | Modify — add 課程 child under 課程管理 Course |
| `environments/environment{,.prod}.ts` | Modify — add `publicSiteUrl` (QR target) |
| `angular.json` | Modify — `allowedCommonJsDependencies: ["qrcode"]` |
| `package.json` | Modify — add `qrcode` + `@types/qrcode` |

### Tests

| File | Action |
|------|--------|
| `CMS.API.Tests/CoursesControllerTests.cs` | Create |
| `core/utils/date.util.spec.ts` | Create |
| `core/services/course.service.spec.ts` | Create |
| `features/courses/course-list/course-list.spec.ts` | Create |
| `features/courses/course-detail/course-detail.spec.ts` | Create |
| `features/courses/course-form/course-form.spec.ts` | Create |
