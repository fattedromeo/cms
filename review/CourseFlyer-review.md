# Pre-Landing Review — Course Flyer (print-to-PDF)

**Branch:** `worktree-feature-course-pdf` → base `develop`
**Commit reviewed:** `8c779be` (Add Course Flyer print-to-PDF feature)
**Date:** 2026-07-17
**Reviewers:** structured critical pass + 6 specialists (testing, maintainability, security, performance, api-contract, design) + Claude adversarial + red-team gap pass
**Headline:** No P1 / critical / security findings. Feature is sound; remaining items are P2 robustness + P3 polish/doc drift.

**Update 2026-07-17:** P2.1–P2.7 fixed (see "P2 Resolution" below). `ng test` 529/529 green
(incl. new/changed specs), `ng build --configuration production` clean. P3 items untouched —
still open, see their own dispositions below.

---

## Finding Summary

| ID | Sev | Conf | Area | Location | Finding | Disposition |
|----|-----|------|------|----------|---------|-------------|
| FP-1 | — | 10 | data | `environment(.prod).ts` | Footer address flagged as drifted — **verified byte-exact** against live dev DB `TrainingCenter.IsDefault=1` (`台北市復興北路99號14 樓`, space included). | **False positive — no action.** Spec prose quote (`CourseFlyer.md:115`) dropped the space; code is correct. |
| P2.1 | P2 | 8 | correctness | `course-flyer-sheet.html:40`, `course-flyer-page.ts:101` | QR `<img>` has no `(error)` handler; only `toDataURL` rejection is wired. Img decode failure → `qrPainted` never set → `?print=1` stalls on 準備列印… forever (F5 re-arms). Spec's self-declared worst failure mode. | **Fixed** |
| P2.2 | P2 | 7 | lifecycle | `course-flyer-page.ts:76` | `getWithLabels` subscription not tied to `DestroyRef`. Slow load + navigate away → `next()` runs post-destroy and rewrites `document.title` after `ngOnDestroy` restored it → wrong tab title for the session. | **Fixed** |
| P2.3 | P2 | 7 | lifecycle | `course-flyer-page.ts:155,159,168` | `queuePrint` rAF/setTimeout chain + `firePrint` not destroy-guarded → `window.print()` can fire on another route (chrome visible, forced A4); `stripPrintParam` navigates via stale `ActivatedRoute` with `replaceUrl`. | **Fixed** |
| P2.4 | P2 | 7 | UX dead-end | `course-flyer-page.ts:142`, `course-flyer-page.html:37` | Non-live course + `?print=1`, user declines → `printPending` never clears: 準備列印… shows forever, `?print=1` stays in URL, F5 re-arms. Cancel affordance only exists in the QR-error banner, not the publish-warning banner. | **Fixed** |
| P2.5 | P2 | 7 | correctness | `course-flyer-page.ts:121,159`, `:65` | Manual `print()` calls `window.print()` synchronously in change detection (violates the file's own comment) and `canPrint` gates on `qrDataUrl` set, not `qrPainted` → fast 列印 click can print before QR paints. No double-fire guard in `firePrint` (confirm-then-click → two dialogs). | **Fixed** |
| P2.6 | P2 | 7 | test gap | `course-flyer-page.spec.ts`, `course.service.spec.ts`, `course-detail.spec.ts` | Untested paths: `printWithoutQr()` both branches; `renderQr` catch (spec pokes signal instead of exercising the throw); `CourseDetail.flyer()` nav; load-error + `?print=1` combo; `getWithLabels` lookup-endpoint-failure branch. | **Fixed** |
| P2.7 | P2 | 6 | test flake | `course-flyer-page.spec.ts:13` | `today` captured at module load, `isLive()` re-reads `new Date()` at assert time → `ScheduleOn/Off = today` boundary tests flake across local midnight. | **Fixed** — `jasmine.clock().mockDate` |
| P3.1 | P3 | 8 | visual | `course-flyer-page.html:33`, `.scss` | `.status-card` used but not defined in `course-flyer-page.scss` (component-scoped elsewhere) → 載入中…/查無此課程 render as bare `.card` with no padding, off-pattern. | Cheap fix or promote to `styles.scss` |
| P3.2 | P3 | 6 | layout | `course-flyer-page.scss:7` | `.flyer-page { margin: -1rem }` claims to cancel `.content` padding, but `.content` (`app.scss:141`) has none → 2rem overflow, likely horizontal scrollbar + 1rem under sticky topbar. | Verify on screen; drop negative margin |
| P3.3 | P3 | 6 | print | `course-flyer-sheet.scss:186` | After 仍要列印, the dashed-red `.sheet__qr-error` box + scan hint print on the paper flyer (no `@media print` suppression). | Cheap fix — hide in print |
| P3.4 | P3 | 7 | fragility | `styles.scss:171` | Whole shell print-reset hangs on one `html:has(body.flyer-print)`; a browser without `:has()` drops the entire comma-list incl. load-bearing `.layout`/`.content` resets → print truncates to one page. Low risk (Chrome-target, 105+). | Split the `html:has()` line into its own block |
| P3.5 | P3 | 9 | doc contract | `spec/reference/features.md` | `CLAUDE.md` was edited to claim "one entry each in features.md" and lists CourseFlyer, but `features.md` has no entry → breaks the file's own contract. | Add the entry |
| P3.6 | P3 | 8 | doc drift | `spec/course/Course.md:401,576` | `CoursePublishStatusRef` DTO snippets (C# + TS) still lack `IsPublished`/`isPublished`. | Update or cross-reference |
| P3.7 | P3 | 8 | perf | `course-flyer-page.ts:76`, `course.service.ts:40` | Flyer uses `getWithLabels` (3-way `forkJoin`) but consumes only `course` + `certificationLabels` → one unused job-category GET on the print-latency path. | Cert-only variant, or accept |
| P3.8 | P3 | 5 | correctness | `course-flyer-sheet.ts:99` | `stripHtml` fast path: `&amp;`/`&nbsp;` without `<` prints literally (inconsistent with tagged rows); `textContent` drops `<br>`/block line breaks → glued sentences. | **Investigate** dev data for `<br>` in Objective/Outline; gate fast path on `/[<&]/` |
| P3.9 | P3 | 6 | DRY | `course-flyer-page.ts`, `course-detail.ts`, specs | Gate condition `isLive() \|\| printConfirmed()` ×3; `?print=1` bare literals in 2 lazy chunks; `siteLabel` duplicates `publicSiteUrl` host; full Course fixture copy-pasted across 6 spec files. | Defer to TODOs |
| P3.10 | P3 | 8 | process | `spec/course/CourseFlyer.md:5`, `TODOS.md` | Design record anchored to machine-local `~/.gstack/...` path (unreachable from other clones/CI); "install jq" is machine setup in a repo TODO. | Copy decision summary into repo; move env item out |

**Accepted as-designed (noted, no action):** global `@page A4` affects all routes' Ctrl+P (plan-accepted, can't be scoped); `isLive()`/`generatedDate` frozen at load across midnight (spec calls the gate best-effort); lookup-failure surfaces as 查無此課程 (pre-existing detail-page pattern); deploy API before/with frontend (old API → `isPublished` undefined → fail-safe warning banner only).

**Counts:** 0 critical · 5 robustness (P2) + 2 test (P2), all **fixed** · 10 polish/doc (P3, still open) · 1 false positive · 4 accepted-by-design.

---

## Scope Check

- **Intent** (approved design doc + commits): print-CSS flyer route, publish-gated, `?print=1` auto-print, QR reuse extracted to a util, one read-only backend column.
- **Delivered:** exactly that. No scope creep. Deferred items (batch catalog, `?src=flyer`, share-as-PNG, server-side QuestPDF) correctly parked in `TODOS.md`, not half-built.
- **Plan completion:** design-doc tasks T1–T9 all shipped. One promised sub-path only half-wired (P2.1). **Verdict: CLEAN, one gap.**

---

## Detail — P2 Robustness

All in `course-flyer-page.ts` / `course-flyer-sheet.{ts,html}`.

**P2.1 — QR `<img>` missing `(error)` handler.**
`spec/course/CourseFlyer.md` promises "`toDataURL` rejection **or `<img>` error** → visible error + auto-print becomes a decision." Only the `toDataURL` half exists (the `renderQr` try/catch). `course-flyer-sheet.html` binds `(load)="qrImageLoaded.emit()"` with no `(error)`. If the data URL is set but the img fails to decode, `qrPainted` never flips, `tryAutoPrint` never clears `printPending`, param never stripped. Trigger is low-probability (`qrcode` `toDataURL` is reliable) but it's the feature's named worst failure mode and the fix is small.
- **Fix:** add `qrImageError = output<void>()` + `(error)="qrImageError.emit()"` on the sheet img; page handler sets `qrError.set(true)` / clears `qrDataUrl` → routes into the existing error banner.

**P2.2 — Subscription not tied to `DestroyRef`.**
`course-flyer-page.ts:76` subscribes with no `takeUntilDestroyed`. 返回課程 renders during loading, so: open → slow API → 返回課程 → `ngOnDestroy` restores title → response arrives → `next()` re-sets `document.title` (line 83). Wrong tab title for the rest of the session.
- **Fix:** `takeUntilDestroyed(inject(DestroyRef))` on the subscription (also covers `renderQr` promise setting signals post-destroy).

**P2.3 — Deferred print not destroy-guarded.**
`queuePrint` (`:155`) schedules `rAF→rAF→setTimeout(fire)` with no cancellation. Navigate away in that window (or background the tab — rAF throttles) → `window.print()` opens on the now-mounted route with `body.flyer-print` removed (full admin chrome, forced A4); `stripPrintParam` navigates via the stale route with `replaceUrl`.
- **Fix:** capture `DestroyRef`; deferred callback bails if destroyed; don't strip via a stale route.

**P2.4 — Non-live + `?print=1` declined → dead-end.**
Gate holds at `tryAutoPrint` (`:145`) with no state change → `printPending` stays true: 準備列印… forever, `?print=1` in URL, F5 re-arms. Cancel only in the QR-error banner.
- **Fix:** add 取消列印 (reuse `cancelPendingPrint`) to the warning banner, or downgrade `printPending` when the gate holds.

**P2.5 — Manual `print()` skips the auto path's guards.**
`canPrint` gates on `ready()` (= `qrDataUrl` set), not `qrPainted`; `print()`→`firePrint()` calls `window.print()` synchronously in change detection — what lines 151–153 warn against. Fast 列印 click can print before the QR paints. No double-fire guard in `firePrint`.
- **Fix:** route `print()` through `queuePrint`; gate `canPrint` on `qrPainted`; add a `printFired` guard.

**P2.6 / P2.7 — Tests.** Cover the untested branches listed in the summary; freeze the clock in the boundary specs (`jasmine.clock().mockDate`, uninstall in `afterEach`).

---

## P2 Resolution (2026-07-17)

All seven applied as designed above, no scope changes:

- **P2.1** — `CourseFlyerSheet` gained `qrImageError = output<void>()` wired to `(error)` on the
  `<img>` (`course-flyer-sheet.ts`/`.html`). `CourseFlyerPage.onQrImageError()` clears `qrDataUrl`
  and sets `qrError` — routes into the same decision banner as a `toDataURL` rejection.
- **P2.2** — `getWithLabels(pkid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(...)`; a
  slow response after destroy no longer reaches `next()`, so `document.title` can't be rewritten
  post-`ngOnDestroy`.
- **P2.3** — added a `destroyed` flag set at the top of `ngOnDestroy`; `firePrint()` bails when
  `destroyed` (or already `printFired`, see P2.5) before touching `window.print()` or
  `stripPrintParam()`. A deferred `queuePrint` callback landing after navigation is now a no-op.
- **P2.4** — the publish-warning banner now renders 取消列印 (reusing `cancelPendingPrint()`)
  alongside 確認列印 whenever `printPending()` is true, so declining no longer strands
  準備列印… with `?print=1` stuck in the URL.
- **P2.5** — `qrPainted` is now a signal (was a private boolean) so `ready`/`canPrint` react to it
  directly instead of to `qrDataUrl` being merely *set*; `print()` and `printWithoutQr()` both
  route through `queuePrint()` instead of calling `firePrint()` directly; `firePrint()` gained a
  one-shot `printFired` guard shared with the P2.3 fix, so a manual click racing the auto-print
  path can't open a second dialog.
- **P2.6** — added coverage for all five listed gaps (`printWithoutQr()` both branches; `renderQr`
  catch exercised via a real `toDataURL` rejection — a 3,000-char `courseId` that exceeds QR byte
  capacity — rather than a poked signal; `CourseDetail.flyer()` nav, `course-detail.spec.ts`; a
  load-error + `?print=1` combo; `getWithLabels` lookup-endpoint-failure, `course.service.spec.ts`)
  plus regression specs for P2.1–P2.5 themselves (`qrImageError` wiring in both the sheet and page
  specs, the P2.2 post-destroy race via a controllable `Subject`, the P2.3 destroy-guard via a
  captured-not-fired `queuePrint` callback, the P2.4 取消列印 click, the P2.5 `canPrint`/`qrPainted`
  gating and the `printFired` double-dialog guard). One pre-existing test
  (`disables 列印 for a non-live course until confirmed`) had to be updated in place — it poked
  `qrDataUrl` directly, which no longer satisfies `canPrint` after the P2.5 `qrPainted` gating —
  now drives it through `onQrImageLoaded()` like production does.
- **P2.7** — the two boundary specs moved into their own `describe`, wrapped with
  `jasmine.clock().install()` / `mockDate(frozenNow)` in `beforeEach` and `uninstall()` in
  `afterEach`; both the test's `ScheduleOn`/`ScheduleOff` value and the component's internal
  `new Date()` reads now resolve against the same frozen instant. The module-level `today` const
  (the flake source) was removed since nothing else used it.

**Files touched:** `course-flyer-page.ts`, `course-flyer-page.html`, `course-flyer-sheet.ts`,
`course-flyer-sheet.html`, `course-flyer-page.spec.ts`, `course-flyer-sheet.spec.ts`,
`course-detail.spec.ts`, `course.service.spec.ts`.

---

## Recommended fix scope

~~Apply **P2.1–P2.7** now~~ — **done, see "P2 Resolution" above.** Remaining: cheap doc/polish
**P3.5, P3.6, P3.1, P3.3**. Fold remaining P3 into `TODOS.md`. Run the **P3.8** `stripHtml` dev-data
check before deciding fix vs documented-accept.

## Verification

- `cd src/CMS.NG && npx ng test --watch=false --browsers=ChromeHeadless` — **529/529 green**,
  incl. new P2.1–P2.7 specs and the clock-frozen boundary specs.
- `npx ng build --configuration production` — **clean** (green test ≠ compiles).
- `cd src && dotnet test CMS.sln` — not re-run; P2.1–P2.7 fixes are frontend-only, no backend
  files touched. Still owed before landing per the original review (`IsPublished` projection
  assertion).
- Manual (spec's manual-verify list, **not yet performed**): print verification rows (pkid 1319
  CJK, pkid 2103 trailing space, `DO180(NO)`, longest-Outline) to PDF with headers/footers AND
  background graphics unchecked; confirm page 2 exists, QR scans ≥25mm, no admin chrome, Letter
  override doesn't clip. Also re-drive the state machine by hand: non-live + `?print=1` → warning
  + 取消列印 clears the hold; force a real QR `<img>` decode error → decision banner, not a stall;
  navigate away mid-load → tab title intact.
- Re-drive the state machine: non-live + `?print=1` → warning + 取消列印 clears the hold; force a QR error → decision banner, not a stall; navigate away mid-load → tab title intact.
