# Build Spec for Course Flyer (print-to-PDF)

A **feature** spec, not a table spec — no new table, no schema change, one read-only column added
to the Course DTO projection. Full design rationale, review trail, and alternatives:
`~/.gstack/projects/fattedromeo-cms/Admin-worktree-feature-course-pdf-design-20260716-115217.md`
(APPROVED 2026-07-16). Read `spec/reference/frontend.md` and `cross-cutting.md` before touching
the code.

## Summary

| Item | Value |
|------|-------|
| What | Branded A4 one-page flyer of a course, printed/saved-as-PDF via the browser print dialog |
| Where | `/courses/:id/flyer` (lazy, auth-guarded); 列印傳單 button on the Course detail page opens it with `?print=1` |
| Why print-CSS | The flyer must render Traditional Chinese flawlessly — the browser print engine does that natively; jsPDF/pdfmake need a multi-MB embedded TC font (rejected) |
| Components | `CourseFlyerPage` (route wrapper) hosts `CourseFlyerSheet` (pure presentational — the future batch-catalog page unit) |
| Backend delta | `PublishStatus.IsPublished` projected into the Course DTO (JOIN column + property). Read-only; no RowAudit implication |
| Filename | `document.title = "{courseId.trim()} {title}"` → Chrome's Save-as-PDF default |

## Publish gate (premise: only publicly-live courses reach paper without a warning)

- Live = `isPublished === true` AND `scheduleOn ≤ today ≤ scheduleOff` (**inclusive both ends**,
  compared as `yyyy-MM-dd` strings via `date.util.ts` — never `toISOString`, rule 17).
- Not live → prominent on-screen warning banner; `?print=1` holds until an explicit confirm.
  Confirm is **per-visit** component state (reset on route re-entry); the banner always shows on
  screen for a non-live course — confirm only unblocks printing.
- ⚠️ **Never hardcode status pkids.** Dev data proves why: a 4th status row exists
  (`pkid 200 "OK"`, `IsPublished = 1`, 0 courses) beyond the expected 草稿/上架中/已下架 —
  pkid-based logic would silently misclassify it. The `IsPublished` bit is the schema's truth
  (rule 1). Publish status and schedule window are **independent** in real data (published rows
  exist with past `ScheduleOff`), hence the AND.
- The gate is a **best-effort heuristic**: the public site's real visibility logic lives outside
  this repo.

## `?print=1` orchestration

1. Load via `CourseService.getWithLabels(pkid)`; 404/error → 查無資料 page (no flyer, no print).
2. QR renders (`qr.util.ts`, `toDataURL`) — the same public URL as the detail page's QR panel,
   `encodeURIComponent(courseId)` verbatim (rule 18; route param is integer pkid, no encoding).
3. Print fires only after QR `<img>` `load` → `afterNextRender`/double-rAF →
   `setTimeout(() => window.print())` — `window.print()` is synchronous; never call it inside
   change detection (`load` fires on decode, not paint).
4. After firing once, strip the param:
   `router.navigate([], { queryParams: { print: null }, queryParamsHandling: 'merge', replaceUrl: true })`
   — F5/back-forward must not re-print or re-arm the confirm.
5. **QR failure is loud, never a stall**: `toDataURL` rejection or `<img>` error → visible error
   in the QR slot; a pending auto-print becomes a decision (print without QR / cancel). A silent
   never-firing `?print=1` is this feature's worst failure mode.
6. Hold states: 載入中… while loading; 準備列印… while `?print=1` is pending.

## Sheet content (marketing selection — never the admin field set)

Title (22–24pt/700, max 2 lines) · OfficialTitle (10.5pt muted) · facts strip
時數/定價/課程代號/相關認證 (labels 8pt, values 14pt semibold, **定價 16–17pt bold dominant**) ·
sections 課程目標/適合對象/先修條件/課程大綱 (headings 12pt `border-left`, body 10pt/1.7) ·
footer fixture: contact block + generation date + 價格與開課資訊以官網公告為準 + QR ≥25mm with
CourseId caption.

- **Empty = omitted entirely** — no bare headings, no blank cells; empty cert cell → 3-cell strip.
- Certifications overflow: first 2 labels + `等 N 項認證`, one line, never wrap the strip.
- `ListPrice = 0` → 洽詢 (verified: 1 dev row, a 已下架 course); `Hour = 0` → cell omitted
  (verified: 9 dev rows exist). `NT$ #,##0` / `{n} 小時` otherwise.
- Long text: `white-space: pre-wrap` (matches the detail page; preserves CJK full-width-space
  indentation) — **never `[innerHTML]`**.
- **Real rows embed HTML fragments** (`<font color=…>`, `<sup>®</sup>` — e.g. the SSCP row's
  Objective; found by print-PDF verification). The sheet strips tags via
  `DOMParser(...).body.textContent` — extract-only, nothing is ever inserted into the live DOM,
  so the innerHTML ban stands. (Observation: the admin **detail page** shows these tags
  literally too — pre-existing display behavior, out of this feature's scope, noted in TODOS.)
- Admin fields (DisplayOrder, PublishStatus, ProdCourseId, FriendlyUrl, CanRepeat) never render.

## Print CSS — the four traps (each fails silently with a perfect-looking preview)

1. **⚠️ The app shell clips print.** `:host`/`.layout`/`.content` use `height: 100vh` +
   `overflow` — printed output truncates to ~one viewport and page 2 never prints. The global
   print block MUST reset the whole chain: `html, body, .layout, .content { height: auto
   !important; overflow: visible !important }`.
2. **⚠️ Chrome prints with Background graphics OFF.** Every load-bearing visual is a **border,
   not a background** (brand band = `border-bottom`, headings = `border-left`) +
   `print-color-adjust: exact`. Verify with the checkbox off.
3. **⚠️ Scoping:** `CourseFlyerPage` stamps `flyer-print` on `document.body` via `Renderer2`
   (removed on destroy **including the notFound path** — a leaked class rewires every route's
   Ctrl+P; spec-tested). Print rules live in **global `styles.scss`** keyed off
   `body.flyer-print` — component styles are `_ngcontent`-scoped and can't match a body class.
   Chrome that must be hidden: `.sidebar`, **`.topbar`** (the user/profile bar — it printed a
   near-blank first page until print-PDF verification caught it), `<p-toast>` (sits outside
   `.layout`, needs its own selector), and `.no-print`. `@page { size: A4; margin: 12mm }`
   cannot be scoped — it's global, geometry-only, documented.
4. **⚠️ Break rules:** `break-inside: avoid` on the short sections only; 課程大綱 (nvarchar(max))
   flows with `break-after: avoid` on its heading + `orphans: 3; widows: 3` — an avoid-rule on
   the long section shoves it wholesale to page 2 and hollows out page 1.

Also: footer is pinned to the sheet bottom (flex column + `margin-top: auto`) — on a
**single-page flyer** that makes it a page-1 fixture. **When body sections overflow, the footer
follows content to the sheet's last page** (verified in print-PDF output): normal flow cannot
keep it on page 1 without `position: fixed`, which repeats on every page — the rejected option.
Last-page footer is where a reader expects contact/QR on a multi-page handout; accepted and
stated. Same behavior on a Letter override; nothing clips. Page 2 carries no
running header in v1 (documented limitation; Paged.js at batch-catalog time). On screen the sheet
renders at fixed `width: 210mm` on a grey backdrop so the preview's wraps/breaks match paper.
Font stack: `"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`; headings
differentiate by **bold + size, never bold alone** (synthetic CJK bold prints smudged).

## Preview chrome (all hidden in `@media print`)

返回課程 (top-left, mirrors detail page) · 列印 (`[disabled]` until data + QR ready, mirrors the
QR-download pattern) · dismissable hint 列印時請取消「頁首和頁尾」並選擇 A4 (Chrome's default
header prints the app URL across the collateral — CSS cannot disable it) · warning banner ·
RowAudit badge **in the chrome around the sheet, never on it** (rule 20 satisfied; sheet stays
WYSIWYG) · 載入中/準備列印 states.

## Brand constants (`environment.ts` + `.prod.ts`, next to `publicSiteUrl`)

Text-mark "UWA" (the app's existing brand) + public site URL tagline; contact block copied from
the dev DB's `TrainingCenter` `IsDefault = 1` row (台北市復興北路99號14樓 · (02)25149191 分機100 ·
UCOM@uuu.com.tw) — **contact data is never invented**; a wrong phone number on collateral is a
worse silent failure than a stale price.

## Tests

See the sheet/page spec lists in the design doc's test-plan artifact. Non-obvious ones: the
monster row (all NULLs + 0 price + no certs + unpublished + CJK id), boundary dates
(`ScheduleOn = today`, `ScheduleOff = today` both live), footer-date asserts a `yyyy/MM/dd`
shape (never "today" across midnight), byte-exact QR URL for the awkward rows (pkid 1319 CJK,
2103 trailing space, `DO180(NO)`) — asserting the string passed to `toDataURL` (no QR decoder
exists in the repo; scanning is a manual step).

## Manual verification (cannot be automated — do not skip)

Print the verification row set with **hostile dialog settings**: headers/footers unchecked,
background graphics unchecked, one Letter override; long-Outline row must produce a real page 2;
Ctrl+P on any other route unchanged; scan the printed QR from paper.

## Out of scope (TODOS.md)

Batch catalog (the sheet is its page unit) · `?src=flyer` attribution (blocked on analytics
access) · LINE/PNG share · server-side QuestPDF · running headers/page numbers (Paged.js later).
