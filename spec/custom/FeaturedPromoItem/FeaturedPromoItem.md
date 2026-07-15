# Build Spec for FeaturedPromoItem

- database schema: `.\database\promotion.sql`
- source spec: `.\spec\custom\FeaturedPromoItem\FeaturedPromoItem.spec.md`
- mockups: `ui-query.spec.png`, `ui-update.spec.png`, `ui-new.spec.png` (style reference only)

## Summary

`FeaturedPromoItem` (上稿作業) pins a `Promotion2` row to one **(ScheduleOn, TrainingCenter, Slot)**
cell of a weekly schedule. The UI is a **week grid**, not a list: a TrainingCenter tab strip × a
Monday-to-Sunday week × three fixed slots per day, with the Edit panel opening inline.

This is the first **customized** CRUD in the app and deliberately departs from the
list/detail/form triple — see [Deviations from convention](#deviations-from-convention).

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **int** IDENTITY(1,1) — auto-generated, immutable |
| Foreign Keys | `Promotion_pkid` → `Promotion2` (NOT NULL), `TrainingCenter_pkid` → `TrainingCenter` (NOT NULL). Both **NO_ACTION** |
| Unique Constraint | `IX_FeaturedPromoItem_UniqueDateLocSlot` on (`ScheduleOn`, `TrainingCenter_pkid`, `Slot`) — **drives the whole move design** |
| Required Fields | All of them — every column is NOT NULL |
| N-N Relationships | **N/A** |
| Primary-Foreign Links | **None** — nothing FK-references this table |
| Query Filters | `TrainingCenter_pkid` (tab), `ScheduleOn` from/to (the week), keyword, `Promotion_pkid` |
| Default Sort | `ScheduleOn ASC, TrainingCenter_pkid ASC, Slot ASC` |

---

## Localization

### Chinese Table Name

- FeaturedPromoItem: 上稿作業
- Description: 首頁精選活動排程，依訓練中心與日期指定每日三個曝光欄位

### Chinese Column Names

- pkid: 主代碼
- ScheduleOn: 上稿日期
- TrainingCenter_pkid: 訓練中心
- Slot: 欄位
- Promotion_pkid: 活動
- Topic: 標題
- Description: 說明

---

## What the dev DB actually says

Queried before building, per `spec/reference/workflow.md`. Several of these changed the design.

| Fact | Value | Consequence |
|------|-------|-------------|
| Row count | 31,715 (2019-05-15 → 2026-08-14) | `GET /api/featured-promo-items` is never used by the UI; the grid always sends a week bound |
| Distinct `Slot` | **only 1, 2, 3** | Request DTO pins `[Range(1,3)]`; the tinyint column would accept 0–255 |
| TrainingCenter rows | 5 — pkids **1, 2, 3, 5, 54** | ⚠️ **Not contiguous.** Tabs must send the pkid, never the tab index |
| `TrainingCenter.DisplayOrder` | 5 rows, 5 distinct values (1–5) | Genuinely a global ordering here — `ORDER BY t.DisplayOrder` is safe, unlike `Course.DisplayOrder` |
| TrainingCenter 54 (線上研討會) | **0 rows** | Its tab must render an empty week, not 404 |
| (day, center) with < 3 slots | 15 combos | Slots are **not dense** |
| A real hole | 2026-07-30 / center 3 holds slots **1 and 3** | The grid is built from the fixed slot list and rows matched into it — iterating the response would slide slot 3 up into slot 2's row |
| `Topic` == parent promo's `Topic` | 1,845 / 31,715 (~6%), uniformly low **every year 2019–2026** | Topic/Description are **per-item free text**, not a denormalized copy → the PromoCode lookup must not overwrite them |
| `Promotion2` rows | 1,157, `PromoCode` UNIQUE | Small enough to ship whole and filter client-side |
| Promo publish statuses | 525 draft / 294 published / 338 discontinued, all referenced by existing rows | The PromoCode lookup is **not** filtered by status |
| FKs referencing this table | **none** (`sys.foreign_keys`) | DELETE is isolated: no 547, no cascade, no warning needed in the confirm |

---

## ⚠️ The unique index vs. the 「+」/「--」 buttons

`IX_FeaturedPromoItem_UniqueDateLocSlot` makes (ScheduleOn, TrainingCenter_pkid, Slot) unique, so
moving a row between slots collides with whatever already sits there. **Verified on the dev DB:**

| Approach | Result |
|----------|--------|
| Sequential two-step update (`SET Slot=2 WHERE pkid=@a` then `@b`) | ❌ **SqlException 2627** on the first statement |
| Single-statement `CASE` swap over both pkids | ✅ succeeds — the unique index is checked at *statement* completion |
| Park-at-0 then two updates, in a transaction | ✅ succeeds, but needs a sentinel value and three round trips |

`FeaturedPromoItemRepository.MoveAsync` uses the **single-statement CASE swap**, inside a
transaction with `UPDLOCK, HOLDLOCK` on the read so a concurrent move on the same day cannot
interleave and resurrect the 2627.

The target slot may legitimately be **empty** (see the hole above), in which case there is no swap
partner and the move is a plain `UPDATE`. `MoveAsync` checks for an occupant first.

**`Slot` is deliberately absent from the UPDATE column list** in `UpdateAsync`. If the Edit form
could post a Slot, it would be a second, swap-unaware path to the same 2627. Slot changes go
exclusively through `/move`.

---

## Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| GET | `/api/featured-promo-items` | All 31,715 rows. Convention only — the UI never calls it |
| POST | `/api/featured-promo-items/query` | The grid's only read. Tab + inclusive `ScheduleOnFrom`/`To` |
| GET | `/api/featured-promo-items/{id}` | |
| POST | `/api/featured-promo-items` | 201; **409** on a duplicate cell (2627) or unknown promo (547) |
| PUT | `/api/featured-promo-items` | pkid in body; ignores `Slot`; 409 as above |
| DELETE | `/api/featured-promo-items/{id}` | Always isolated — no 547 path |
| POST | `/api/featured-promo-items/move` | `{pkid, direction:"up"\|"down"}` → 204 / 400 at a bound / 404 |
| GET | `/api/lookups/training-centers` | The tabs. Label = `Name`, ordered by `DisplayOrder` |
| GET | `/api/lookups/promotions` | The PromoCode type-ahead. Label = `PromoCode`, ordered by `PromoCode ASC` |

`direction` is a **string, not an enum**: the API registers no `JsonStringEnumConverter`, so an
enum would serialize as an opaque 0/1.

### The one-week filter lives in the frontend

The API applies a plain inclusive `ScheduleOn` range and has no notion of "a week". The grid owns
the Monday arithmetic (`startOfWeek` in `core/utils/date.util.ts`) and posts both ends. Sunday is
**Monday + 6**, not + 7 — the bounds are inclusive at both ends.

---

## Decisions taken (and why)

1. **The PromoCode lookup sets `Promotion_pkid` only** — it does not seed Topic/Description.
   Confirmed with the user; backed by the ~6% match rate above. The source spec says the lookup
   "set[s] Promotion_pkid", and nothing more.
2. **The lookup offers all 1,157 promos, unfiltered by publish status.** Confirmed with the user.
   Nothing in the schema or spec restricts the choice, and live rows reference draft, published and
   discontinued promos alike. Filtering would be an invented rule.
3. **Copy/Paste is an in-memory clipboard** holding the *payload* (promo + topic + description),
   never the cell. It survives tab and week navigation, so Monday/台北 can be pasted into
   Friday/高雄. Paste opens a **create** (pkid 0) against the pasted-into cell.
4. **`+` moves DOWN the list** (slot 1 → 2) and `--` moves UP (slot 2 → 1), per the source spec.
   Both buttons are disabled at the bounds and on empty cells.
5. **Delete needs no cascade warning.** Nothing FK-references this table.

---

## Deviations from convention

Recorded because they are deliberate, not oversights:

- **No `{table}-detail` page and no `/new` or `/:id` routes.** The grid *is* the detail view; a row
  is meaningless outside its (date, center, slot) cell. `/featured-promo-items` is a single route.
- **No `p-table`, no filter `p-drawer`, no pagination.** The week grid replaces all three: the tab
  and the week navigator *are* the filter, and a week is at most 21 rows.
- **`{table}-form` is an inline panel, not a routed page.** It takes the cell as signal `input()`s
  and emits a request rather than saving or navigating itself.
- **sessionStorage** persists `featured-promo-item-list-filters` = `{trainingCenterPkid, weekStart}`.
  There is no `-sort` or `-page` key because there is no sorting or paging. A restored `weekStart`
  is re-normalised through `startOfWeek` so a stale value cannot skew the grid off Monday.

---

## Verified against the dev DB

Controller tests mock the repository, so the following were checked live and **cannot** be caught by
the suite. All exploratory writes were rolled back or deleted; the table was left at 31,715 rows
with TrainingCenter 54 still empty.

- Sequential slot update raises **2627**; the single-statement CASE swap succeeds. Both directions
  of a real swap (76884 ↔ 76890 on 2026-03-16/台北) round-tripped back to baseline.
- Move into an **empty** slot (the 2026-07-30 / center 3 hole) succeeds as a plain update.
- Move at a bound → 400; unknown pkid → 404; `direction: "sideways"` → 400.
- Create → **201**; duplicate cell → **409** (2627); `promotionPkid: 99999999` → **409** (547).
- Update → 204 and Traditional-Chinese text round-trips intact; delete → 204, then GET → 404.
- The multi-map `splitOn: "Pkid"` resolves the `promotion` nav object (not null, not split away)
  and `ScheduleOn` serializes as a bare `2026-03-16` with no timezone.
- Both lookups return the expected rows: 5 tabs ordered 台北/新竹/台中/高雄/線上研討會, 1,157 promos.

### Known coverage gaps

- **The 2627 → 409 and 547 → 409 paths are not unit-tested.** `SqlException` has no public
  constructor, so a mocked repo cannot throw one (the same gap `spec/reference/backend.md` records
  for the 547 → 409 delete path elsewhere). Verified live instead, as above.
- **The swap itself is SQL semantics** and lives in the repository, so no controller test can catch
  a regression in it. If `MoveAsync` is ever rewritten, re-run the live check above.
- **No browser-driven test.** The Karma specs render the real templates with the real PrimeNG
  modules, but nothing exercises the assembled page in a browser.

---

## Deferred

- **No `Promotion2` CRUD page exists**, so the grid does not link a PromoCode out to its promo.
  Per `spec/reference/workflow.md` ("don't wire links to routes that don't exist yet"), that link
  is recorded here and omitted from the code. Wire it if 活動管理 Promotion is ever built.
  The *lookup* endpoint is exempt from that rule and was added, as it must be.
- **No bulk "copy this week to next week"** — the source spec describes only per-row Copy/Paste.
