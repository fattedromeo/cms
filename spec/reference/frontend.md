# Frontend reference (CMS.NG)

Read before touching `src/CMS.NG`. Scaffolding shapes live in `spec/code-gen.convention.md`.

## Structure

- Standalone components, lazy-loaded routes (`app.routes.ts`); declare `new` **before** `:id`.
- **No API proxy** — base URL from `src/environments/environment.ts`; `environment.prod.ts` is
  swapped in via `fileReplacements` in `angular.json`.
- **Path aliases** (`tsconfig.json`): `@env/*`, `@app/*`, `@core/*`, `@features/*`.
- Feature folders: `features/{table-plural}/{table}-list | {table}-detail | {table}-form`.
- Services live in `core/services`, models in `core/models`, helpers in `core/utils`.
- Sidebar nav lives in `app.ts` / `app.html`; add a child under the right group (some entries
  exist as `disabled: true` placeholders — replace with `route:` rather than adding a duplicate).
- List pages: `p-table` (sortable/paginated) + filter `p-drawer`; persist filters/sort/page to
  `sessionStorage` under `{table}-list-filters | -sort | -page`.
- Forms: Reactive Forms, `forkJoin` for parallel lookup loads; the immutable key is `disable()`d in
  edit mode (so read via `getRawValue()`); `p-multiselect` for N-N with `[maxSelectedLabels]="9999"`.
- PrimeNG needs animations (`provideAnimationsAsync`) + `providePrimeNG` theme (`app.config.ts`).
  In component specs, provide `provideNoopAnimations()`.

## PrimeNG is pinned to v20

`primeng@latest` pulls v21, which requires Angular 21. In v20:

- the old `Sidebar` is `Drawer` (`p-drawer`, `primeng/drawer`);
- Tabs is the nested `p-tabs` › `p-tablist` › `p-tab` / `p-tabpanels` › `p-tabpanel`
  (`primeng/tabs`, `TabsModule`) — **not** the old `p-tabView`/`p-tabPanel`. `Tabs.value` is a
  `ModelSignal`, so bind `[value]` + `(valueChange)` (or `[(value)]`), not an `activeIndex`.

**Confirm any v20 API against `node_modules/primeng/{module}/index.d.ts`** — v21 docs online will
not match.

The pin also means **a component you'd expect from PrimeNG may only exist in v21** — QRCode is the
first case. Check `node_modules/primeng/` before reaching for a v21 feature, and prefer a
**framework-agnostic** library over an Angular-specific one when you must add a dep: `qrcode` was
chosen over `angularx-qrcode` because its version doesn't track Angular's, so it can't repeat this
same pinning trap. A **CommonJS** dep (like `qrcode`) must be added to `angular.json` →
`allowedCommonJsDependencies` or every prod build warns about optimization bailouts.

Sizing rules: `p-select` in a drawer always `appendTo="body"`; `[filter]="true"` for 10+ options;
add `[virtualScroll]="true" [virtualScrollItemSize]="43"` at 100+ (e.g. CourseGroup has 214).

## ⚠️ `LookupItem.pkid` is a `string`

FK form controls and `{Table}Query` DTOs hold `number`. Map once before binding:
`options.map(o => ({ pkid: Number(o.pkid), label: o.label }))`. A `p-select` bound to string options
will never match a numeric `formControl` value and **silently shows blank**. See the
`*SelectOptions` getters in `course-list.ts` / `course-form.ts`.

Exception: when the lookup's `pkid` genuinely *is* a string key (`app-roles` carries `RoleId`), bind
it straight through — no conversion.

## ⚠️ Dates

- **`date` fields**: use `core/utils/date.util.ts` (`toIso` / `fromIso` / `addYears`).
  **Never** `d.toISOString().split('T')[0]` — it converts to UTC first, so a date picked as
  2026-03-01 local serializes as **2026-02-28** in UTC+8. **Never** `new Date('2026-03-01')` — it
  parses as UTC midnight and renders as the previous day.
- **`DateOnly` fields arrive as plain `yyyy-MM-dd`** with no timezone, so the `dt + 'Z'` trick does
  **not** apply to them.
- **`datetime` fields do need `'Z'`**: Dapper returns them with `Kind = Unspecified`, so append it
  before parsing — `{{ u.passwordUpdatedTime + 'Z' | date:'yyyy/MM/dd HH:mm' }}` (see `AppUser`).

## ⚠️ A spec whose template uses `routerLink` cannot mock `Router`

`RouterLink` subscribes to `router.events`, which a `jasmine.createSpyObj<Router>` lacks — it fails
with `Cannot read properties of undefined (reading 'subscribe')`. Use `provideRouter([])` and
`spyOn(TestBed.inject(Router), 'navigate')` instead (see `course-detail.spec.ts`).

Specs with no `routerLink` in the template can keep mocking Router (see `course-group-detail.spec.ts`).

## Tabbed forms hide validation errors

Only `course-form` uses `p-tabs`. Tabs can leave a failed save with nothing visibly wrong, so a
tabbed form carries two mitigations: a per-tab error badge (`tabInvalid()`) and auto-switching to
the first invalid tab on save. Don't set `[lazy]="true"` — panels must stay rendered so controls
initialise and badges are accurate on first paint.

## Prod bundle is over its budget ceiling

`initial` is **~511 kB** against a `maximumWarning` of 500 kB, so `ng build --configuration
production` emits a budget **warning**. `maximumError` is 2 MB, so it still succeeds.

This is **not** a per-feature regression: feature components are lazy chunks and `main` barely moves
(+0.4 kB for routes/sidebar). The growth is shared PrimeNG internals landing in the common chunk the
initial bundle already references via `providePrimeNG` — Course first pulled in `p-select` /
`p-datepicker` / `p-tabs` / `p-checkbox` / `p-textarea` (491→501 kB), AppUser then added `p-tag` /
`p-multiselect` (501→511 kB). Each new PrimeNG primitive pushes it further.

**Raise `maximumWarning` in `angular.json`** rather than hunting a regression; measure against a
stashed baseline before assuming otherwise.
