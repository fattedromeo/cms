# TODOS

Deferred work with context. Format: What / Why / Context / Effort (human → CC) / Priority / Depends on.

## From /autoplan review of the Course Flyer design (2026-07-16)

- [ ] **Batch course catalog** — select courses on the list page → one multi-page PDF with cover page.
  Why: the 10x version of the flyer; staff hand out a term catalog, not N sheets.
  Context: `CourseFlyerSheet` is deliberately a pure `course`-input component so the catalog is a loop +
  `break-after: page`. Adopt Paged.js at this point for running headers/page numbers (also fixes the
  "page 2 has no identity" v1 limitation). Design doc: `~/.gstack/projects/fattedromeo-cms/Admin-worktree-feature-course-pdf-design-20260716-115217.md`.
  Effort: L → M. Priority: P2. Depends on: flyer v1 shipped.

- [ ] **`?src=flyer` QR scan attribution** — tag the flyer QR so printed handouts are measurable.
  Why: turns paper into a measurable channel; can prove the feature's value.
  Context: BLOCKED on two checks — (a) public course page tolerates query params, (b) we have access to
  uuu.com.tw analytics to ever read the attribution. If (b) is no, KILL this item rather than keep it
  (an idea that can never pay off is planning debt). Also amends the verbatim-URL contract in
  `spec/course/CourseQRCode.md`.
  Effort: S → S. Priority: P3. Depends on: analytics access confirmation.

- [ ] **Share flyer as image (LINE)** — render the flyer to PNG for digital hand-off to the walk-away student.
  Why: the "I'll think about it" student leaves with the flyer in their pocket.
  Context: canvas pipeline exists (`composePng` pattern in course-detail). Judged v1 scope creep by two
  independent reviews. Revisit after v1 usage feedback.
  Effort: M → S. Priority: P3.

- [ ] **Server-side PDF (QuestPDF)** — true one-click .pdf download with exact filename.
  Why: removes the print-dialog dependency (browser headers/footers, paper-size overrides).
  Context: only if one-click download becomes a real ask; requires bundling a Noto Sans TC font
  server-side and a server QR generator. Approach B in the design doc.
  Effort: L → M. Priority: P3.

- [ ] **DESIGN.md / design system** — no DESIGN.md exists; flyer typography values live only in the feature spec.
  Why: second print/branded feature will re-derive the same decisions.
  Context: run `/design-consultation`; fold the flyer's type scale + TC font stack into it.
  Effort: M → S. Priority: P3.

- [ ] **Install jq on this machine** — `/autoplan` cross-phase task aggregation and several gstack
  telemetry paths silently no-op without it. Effort: S. Priority: P3. (Environment, not repo.)
