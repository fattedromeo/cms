# Build Spec for Course QR Code

Extracted from `spec/course/Course.md`, which now points here. This is a **feature** spec, not a
table spec — there is no QR table, no endpoint and no SQL. It documents the QR panel on the Course
**detail** page (`spec/course/Course.md` remains the spec for the Course entity itself).

Read `spec/reference/frontend.md` before touching the code.

---

## Summary

| Item | Value |
|------|-------|
| Where | Course detail page (`/courses/:id`), inside the **基本資料** card |
| Generated | **Client-side on course load** — there is no QR endpoint and no server round-trip |
| Encodes | `{environment.publicSiteUrl}/Course/Show/{pkid}/{encodeURIComponent(courseId)}` |
| On-page | Bare QR (`toDataURL`) + `courseId` as an **HTML** caption |
| Download | `下載 QR Code` → **composited** PNG (caption drawn in) named `{courseId.trim()}.png` |
| Library | `qrcode` (node-qrcode) — the app's only non-PrimeNG UI dependency |

The QR is a read-only view concern: it has no bearing on create/update/delete, and nothing about
Course's DTOs, SQL or validation changes because of it.

## Placement and layout

Lives beside the field list in the 基本資料 card:

- `.basic-layout` — `display: flex; flex-wrap: wrap; align-items: flex-start`.
- `.basic-layout .detail-grid` — `flex: 1 1 24rem`; `.qr-panel` — `flex: 0 0 auto`.
- Together these make the panel **drop below the field list on a narrow viewport** rather than
  squeeze it; no media query is involved.
- `.qr-panel__title` is `max-width: 220px` + `word-break: break-all` — it must wrap, because
  `CourseId` reaches 18 chars and one dev row is CJK.

Markup is a `<figure class="qr-panel">` › `<img class="qr-panel__image">` + `<figcaption
class="qr-panel__title">`. The image `alt` is `課程 {courseId} QR Code`. The download button is
`[disabled]="!qrDataUrl()"` so it cannot fire before the QR has rendered.

## What it encodes

`{environment.publicSiteUrl}/Course/Show/{pkid}/{encodeURIComponent(courseId)}`

**The base URL is `environment.publicSiteUrl`** (`https://www.uuu.com.tw`, same in
`environment.ts` and `environment.prod.ts`) — **not `apiUrl`**. It points at the public course site,
not at this API. It is kept in the environment file, not the component, so the domain stays
swappable.

### ⚠️ `CourseId` is not URL-safe — `encodeURIComponent` is mandatory

Verified against the dev DB: **15 of the 1,080 rows** hold characters outside `[A-Za-z0-9._-]` —

| Hazard | Example |
|--------|---------|
| Space | `AIteam-Open Source` |
| **Trailing** space | pkid 2103 = `23aiNFA ` |
| Parentheses | `DO180(NO)` |
| CJK | pkid 1319 = `Python-程式設計開發應用` |

Raw interpolation would emit a broken URL for those rows — **no exception, and a test asserting only
the pretty case still passes** (see the general rule in `spec/reference/frontend.md`). `pkid` is an
`int` and needs no encoding.

The QR encodes the **stored value verbatim**: `23aiNFA ` becomes `.../2103/23aiNFA%20`, *not* a
trimmed variant, so the QR always resolves to exactly the CourseId the record holds. The **filename**
is the one place that trims — a trailing space does not survive a filesystem anyway.

> Verified end-to-end by generating and **decoding** the QR for all five awkward rows: each scans
> back to the intended URL, including the CJK one (`%E7%A8%8B…`) and the trailing space. The
> composited PNG (caption drawn on) still scans — the caption band does not intrude on the symbol.

## Library

`qrcode` (node-qrcode) **^1.5.4** + `@types/qrcode` **^1.5.6**.

- **PrimeNG v20 has no QR component.** v21 added one, but that needs Angular 21 — see the v20 pin in
  `spec/reference/frontend.md`.
- **`qrcode` was chosen over `angularx-qrcode` precisely because it is framework-agnostic**: its
  version does not track Angular's, so it cannot repeat the PrimeNG-v21 pinning trap.
- It is **CommonJS** → it must be listed in `angular.json` → `allowedCommonJsDependencies`,
  otherwise every prod build prints an optimization-bailout warning.
- It costs the **initial bundle nothing** — it resolves into the lazy `course-detail` chunk (34 kB).

Shared options for both render paths:

```ts
const QR_OPTIONS: QRCodeRenderersOptions = { errorCorrectionLevel: 'M', margin: 2, width: 220 };
```

## Canvas compositing

Two render paths, deliberately different:

| Path | Call | Caption |
|------|------|---------|
| On page | `toDataURL` → `qrDataUrl` signal | HTML `<figcaption>` |
| Download | `toCanvas` → composited canvas | **Drawn into the PNG** |

The download composites onto a canvas `CAPTION_BAND_PX` (**34**) taller than the QR, then draws the
caption centred in the band — so the saved file identifies its own course.

Two non-obvious requirements, both silent if missed:

- **⚠️ Paint the white background first.** `qrcode`'s own margin is *transparent*, so a PNG saved
  without the `fillRect` carries a transparent surround — which renders black in many image viewers
  and can defeat scanners that rely on the quiet zone.
- **⚠️ Pass `fillText`'s `maxWidth`** (`canvas.width - 16`). CourseId runs to 18 chars in the dev
  data, which overflows 220 px at 16 px bold; `maxWidth` condenses the text instead of overflowing
  the canvas.

Caption style: `bold 16px sans-serif`, `#111827`, `textAlign: 'center'`, `textBaseline: 'middle'`.

Download is a synthesized `<a download>` whose `href` is the composited data URL:

```ts
anchor.download = `${c.courseId.trim()}.png`;   // trims — see above
```

## Tests — `course-detail.spec.ts` › `describe('QR code')`

The template uses `routerLink`, so the spec **cannot mock `Router`** — use `provideRouter([])` and
spy on `navigate` (the general rule is in `spec/reference/frontend.md`).

| Assertion | Guards |
|-----------|--------|
| Builds the URL from pkid/courseId | the happy path |
| Percent-encodes an unsafe courseId (`23aiNFA ` → `…/2103/23aiNFA%20`) | the 15 awkward rows |
| Does **not** trim before encoding (`%20PLF%20`) | verbatim-encoding rule |
| Empty string before the course loads | no `undefined` in the URL |
| Renders the image; `src` matches `qrDataUrl()`; caption shows courseId | the panel paints |
| Download produces `data:image/png` named `{courseId}.png` | filename + trim |
| Composited PNG is `bare.height + 34` **and `hasInkBelow(bare.height)`** | see below |

> **⚠️ The height assertion alone is not enough.** A canvas 34 px taller passes even if the band is
> blank, so the compositing test decodes the PNG and asserts **real ink in the caption band**
> (`hasInkBelow()` scans for any non-white pixel below `y`). This was confirmed by mutating out the
> `fillText` — height-only assertions stayed green. Keep both.

Helpers in the spec: `loadImage()` (decodes a data URL, rejects on `onerror`) and `hasInkBelow()`.
The download test stubs the anchor `createElement` creates and **spies** its `click` rather than
firing it.

## Files

| File | Role |
|------|------|
| `features/courses/course-detail/course-detail.ts` | `QR_OPTIONS`, `CAPTION_BAND_PX`, `qrUrl` computed, `renderQr`, `composePng`, `downloadQr` |
| `features/courses/course-detail/course-detail.html` | `.qr-panel` figure inside `.basic-layout` |
| `features/courses/course-detail/course-detail.scss` | `.basic-layout`, `.qr-panel*` |
| `features/courses/course-detail/course-detail.spec.ts` | `describe('QR code')` + `loadImage` / `hasInkBelow` |
| `environments/environment{,.prod}.ts` | `publicSiteUrl` (**not** `apiUrl`) |
| `angular.json` | `allowedCommonJsDependencies: ["qrcode"]` |
| `package.json` | `qrcode` + `@types/qrcode` |

## Out of scope

- **No QR endpoint** — generation is client-side only.
- **No QR on the list page** and no bulk/print sheet; `sample1.spec.md`'s print features do not
  exist here.
- **No QR on other entities.** `Partner` / `CourseGroup` have no public-site page to point at.
- `sample1.spec.md` forward-references "canvas compositing details" — that content is the
  [Canvas compositing](#canvas-compositing) section above; the rest of sample1's QR framing describes
  a fuller system than this DB (see `spec/reference/workflow.md`).
