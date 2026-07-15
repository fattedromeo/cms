# Implemented features

Read the entry for a feature before modifying it, and the closest structural match before building
a new one. Each entry records only what the code and schema don't already say.

| Feature | Menu | PK shape | Copy it for |
|---------|------|----------|-------------|
| [Partner](#partner) | 課程管理 → 合作廠商 | `smallint IDENTITY` | any plain IDENTITY-PK table |
| [PublishStatus](#publishstatus) | 系統管理 → 發布狀態 | `tinyint`, **not** IDENTITY | user-assigned PKs |
| [CourseGroup](#coursegroup) | 課程管理 → 課程群組 | `smallint IDENTITY` | plain CRUD + cascade hazard |
| [Course](#course) | 課程管理 → 課程 | `int IDENTITY` | FK nav objects, N-N, `date` |
| [AppRole](#approle) | 系統管理 → 角色 | `RoleId` nvarchar | string/non-`pkid` PKs |
| [AppUser](#appuser) | 系統管理 → 使用者 | `UserId` nvarchar | string PK + backend-only column |
| [FeaturedPromoItem](#featuredpromoitem) | 首頁管理 → 上稿作業 | `int IDENTITY` | a **non-list** UI; unique-index reordering |

---

## Partner

課程管理 Course → 合作廠商 Partner. Plain CRUD, no FKs. `pkid` is `smallint IDENTITY`; sorted by
`DisplayOrder ASC` (genuinely a global ordering here — unlike Course). The reference implementation
to copy for any IDENTITY-PK table.

## PublishStatus

系統管理 Admin → 發布狀態 PublishStatus. Plain CRUD. Spec: `spec/admin/PublishStatus.md`.

- **Key detail**: `pkid` is `tinyint` and **not** IDENTITY — it is user-assigned, so it is included
  in the INSERT column list and there is no `SCOPE_IDENTITY()`. Don't assume a `pkid` is
  auto-generated; check for `IDENTITY` in the table script.

## CourseGroup

課程管理 Course → 課程群組 CourseGroup. Plain CRUD; `pkid` `smallint IDENTITY` + one required
`Description`. Spec: `spec/course/CourseGroup.md`.

- **Key detail**: `FK_Course_CourseGroup` is `ON DELETE CASCADE`, so deleting a group **silently
  deletes its courses**. The delete confirm warns about this.
  `FK_PartnerCourseGroup_CourseGroup` does not cascade and still blocks via 547 → 409.
- `PartnerCourseGroup` is **not** an N-N junction (it has its own `pkid` IDENTITY plus
  `DisplayOrder`/`Description`) — it's a first-class entity.
- Its deferred 「查看課程」 button can now be wired: `/courses` accepts `?courseGroupPkid=`.

## Course

課程管理 Course → 課程 Course. The reference implementation for **FK nav objects, N-N relations and
`date` columns**. `pkid` `int IDENTITY`; 1,080 rows in the dev DB. Spec: `spec/course/Course.md`.

- **Default sort is `CourseId ASC`, not `DisplayOrder ASC`** — despite the template's "prefer
  DisplayOrder" rule. `Course.DisplayOrder` is *not* a global ordering: 1,080 rows share only 65
  distinct values (ambiguous even within one partner — 243 courses / 21 values), while `CourseId` is
  unique across every row. **Check the data before trusting `DisplayOrder`.**
- Three FKs → `Partner` (NOT NULL), `CourseGroup` (**nullable**), `PublishStatus` (NOT NULL),
  resolved as nav objects via multi-map and rendered as links (all three target pages exist).
- N-N: `CourseInCertification` + `CourseJobCategories` — both true junctions, both
  `ON DELETE CASCADE`, so **no explicit junction cleanup on delete** (unlike `AppRole`/`AppUser`);
  the delete confirm warns they vanish. `CourseFAQ` / `CourseRelatedLink` / `HotCourse` do *not*
  cascade and still block via 547 → 409.
- `CourseRecomm` **is not a child of Course** — it references `CourseId` (varchar) with **no FK
  constraint declared**, so it is not enforced, not part of the 547 path, and out of scope.
- The only **tabbed** (`p-tabs`) page in the app — see the tabbed-form rules in
  `spec/reference/frontend.md`.
- `/courses` accepts `?courseGroupPkid=` and `?partnerPkid=` (cross-entity navigation; incoming
  params override saved filter state).
- The detail page's 基本資料 card carries a **QR code** to the public site, generated client-side by
  `qrcode` (the app's only non-PrimeNG UI dep; **CommonJS** → listed in `angular.json`'s
  `allowedCommonJsDependencies`). ⚠️ **`CourseId` is not URL-safe** — 15 of 1,080 dev rows hold
  spaces, trailing spaces, parens or CJK, so the URL segment needs `encodeURIComponent`. The QR
  target lives in `environment.publicSiteUrl`, **not** `apiUrl`. Details in `spec/course/Course.md`.
- ⚠️ `spec/sample1.spec.md` is *also* a Course spec but describes a **fuller system than this DB**:
  its `/copy` endpoint, `ClassSection`/`CourseRecomm` sub-panels, `RowAudit` and print features do
  not exist here. Use it for format only; derive facts from `database/course.sql`. Its QR section
  **is** now built, but it forward-references "canvas compositing details" in `spec/course/Course.md`
  that were never written — that section exists now.

## AppRole

系統管理 Admin → 角色 AppRole. CRUD with N-N users via `AppUserRole`.

- **Key detail**: `dbo.AppRole` has both `pkid` (IDENTITY, display only = 主代碼) and `RoleId`
  (nvarchar, the clustered PK / FK target). `RoleId` is the logical key used in routes
  (`/api/app-roles/{id}`, `encodeURIComponent`) and disabled in the edit form; `pkid` is **never**
  the route key. Apply the same reasoning to any table whose PK constraint is on a non-`pkid` column.
- `Description` is `NULL` in the schema, so it's **optional** in code — even though the
  `ui-sample-add.png` mockup shows an asterisk. **UI mockups are style reference only; the schema
  decides required fields.**

## AppUser

系統管理 Admin → 使用者 AppUser. CRUD with N-N roles via `AppUserRole`. Structural twin of AppRole:
`UserId` (nvarchar) is the clustered PK / route key (an email → `encodeURIComponent` is mandatory),
`pkid` int IDENTITY is display-only. Spec: `spec/auth/AppUser.md`.

- **🔐 `PasswordHash` is backend-only, enforced by the type system.** It appears in **no** model —
  not `AppUser`, not `AppUserRequest`, never in a SELECT list. With no bindable property a client
  cannot over-post it and it cannot leak; the rule does not depend on a runtime check. On **create**
  it is derived server-side (`PasswordHasher.Hash(SysConfig['appConfig'].defaultPassword)`); on
  **update** it is simply absent from the SET list. **No password field in the UI** in either mode.
- **🔐 `SysConfig.configValue` holds secrets — never expose it.** The `appConfig` JSON contains
  `symmetricSecurityKey` (a JWT signing secret) alongside `defaultPassword`. Hence
  `ISysConfigRepository` returns only the one scalar, there is **no SysConfig
  controller/DTO/lookup**, and the value never appears in a log or exception message.
- **⚠️ `PasswordHasher` uses unsalted SHA-256** (UTF-8 → 64 lowercase hex). Weak for passwords — no
  salt, fast, and every account seeded from the shared default gets an identical hash. It exists
  only to interoperate with the existing login app, and the format is **inferred, not confirmed**
  (the sole existing row is 64 hex chars, but its hash is not SHA256 of the default because that
  user changed their password). Verify against the login app before trusting it; only
  `PasswordHasher.Hash` would change.
- `PasswordUpdatedTime` is **NULL on create** = "still on the default password" (`appConfig` sets
  `enforcePasswordPolicy`). The app's first `datetime` column: `DateTime?`, **no** type handler, but
  the frontend must append `'Z'`.
- **No reset-password endpoint** (deliberately deferred) — so there is currently no way to reset a
  forgotten password from this console. Proposed shape is in `spec/auth/AppUser.md`.
- `GET /api/lookups/app-roles` puts **`RoleId`** in `LookupItem.Pkid`, not the surrogate `r.pkid` —
  the junction references `RoleId`. Being a string it needs no `CAST`, so the ORDER BY
  alias-shadowing hazard does not apply.

## FeaturedPromoItem

首頁管理 Home → 上稿作業 FeaturedPromoItem. The first **customized** feature and the reference for a
UI that is *not* a list. `pkid` `int IDENTITY`; 31,715 rows in the dev DB.
Spec: `spec/custom/FeaturedPromoItem/FeaturedPromoItem.md`.

- **The page is a week grid**, not `p-table`: TrainingCenter tabs × a Monday–Sunday week × 3 fixed
  slots per day, Edit opening inline. Consequently there is **no detail page and no `new`/`:id`
  routes** — one route, `/featured-promo-items` — and no drawer, sorting or paging. Copy that shape
  only for another schedule-style page; the list/detail/form triple is still the default.
- **⚠️ `IX_FeaturedPromoItem_UniqueDateLocSlot` (ScheduleOn, TrainingCenter_pkid, Slot) is what makes
  the 「+」/「--」 buttons hard.** A sequential two-step slot update raises **2627**; a
  **single-statement `CASE` swap** succeeds, because the unique index is checked at statement
  completion. Verified both ways on the dev DB. `Slot` is therefore excluded from `UpdateAsync`'s
  SET list — `/move` is the only path that may change it.
- **Slots are not dense.** 15 (day, center) combos have <3 rows and at least one has a *hole* at
  slot 2 (2026-07-30 / center 3 = slots 1 and 3). The grid renders the fixed slot list and matches
  rows into it; iterating the API response would silently slide slot 3 into slot 2's row. `MoveAsync`
  likewise handles an empty target slot as a plain update, with no swap partner.
- **⚠️ TrainingCenter pkids are not contiguous** (1, 2, 3, 5, 54) and **54 (線上研討會) has zero rows**
  — tabs must send the pkid, never the index, and an empty tab is a valid empty week. Its
  `DisplayOrder` *is* a genuine global ordering (5 rows, 5 distinct values), unlike `Course`'s.
- **`Topic`/`Description` are per-item free text, not a copy of the promo's** — only ~6% of rows
  match their `Promotion2.Topic`, uniformly across 2019–2026. The PromoCode lookup sets
  `Promotion_pkid` **only**; it must not seed or overwrite them. `GET /api/lookups/promotions`
  returns all 1,157 promos unfiltered by publish status (live rows reference every status).
- **Nothing FK-references this table**, so DELETE is isolated — no 547 path, no cascade, and the
  confirm text carries no "children will also be deleted" warning (unlike CourseGroup's).
- No `Promotion2` CRUD page exists, so the PromoCode is **not** linked out; recorded in the spec
  instead. The lookup endpoint was still added — a lookup is not a link.
