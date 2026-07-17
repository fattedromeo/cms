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
  A group may set `requiresRole` (系統管理 → `Admin`); the shell only renders when signed in.
- **Every new route needs `canActivate: [authGuard]`** (`[authGuard, adminGuard]` under 系統管理) —
  guards are per-route here, so omitting one leaves the page reachable while signed out. The API
  still refuses the data, so the symptom is a broken page, not a leak. See
  `spec/auth/Authorization.md`.
- **A spec that renders `App`, or any component whose service calls the API, needs an auth session.**
  Use `signInAs([...])` from `@core/testing/auth-test-utils` **before** `TestBed.configureTestingModule`
  — `AuthService` reads session storage once at construction, so seeding afterwards does nothing.
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

### Inline table editing is hand-rolled — `pEditableColumn` is single-click only

`pEditableColumn` hard-wires `host: { listeners: { "click": "onClick($event)" } }` and v20 exposes
no double-click mode, so it **cannot** express "double-click to edit, single click does nothing".
`course-list` therefore owns the trigger (an `editing` signal + `@if` + `(dblclick)` on the `<td>`)
and uses the PrimeNG inputs only as the editors. Copy that, not `pEditableColumn`. Read-only columns
are expressed as the *absence* of a handler — nothing to get wrong.

For overlay editors (`p-select`, `p-datepicker`) blur alone is not a reliable "done" signal, because
the panel can take focus off the trigger; wire their `(onChange)` / `(onSelect)` too and make the
commit idempotent (guard on the editing cell + short-circuit when the value is unchanged) so it
can't fire two PUTs.

### ⚠️ `pAutoFocus`'s input is aliased, and the bare attribute only fails at build

The directive is `[pAutoFocus]="true"` — `autofocus` is the *class* property, aliased to
`pAutoFocus`. Writing the bare attribute `pAutoFocus` passes `''` into a `boolean` input:
`ng test` **passes** (JIT coerces it) and `ng build` fails with TS2322. Same trap for any aliased
boolean input. **A green `ng test` does not mean the template compiles — run the prod build.**

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

## ⚠️ A `varchar` business key in a URL needs `encodeURIComponent` — check the data first

These keys are **not** the tidy alphanumerics they look like: `Course.CourseId` holds spaces,
*trailing* spaces, parens and CJK (15 of 1,080 dev rows); `AppUser.UserId` is an email. Raw
interpolation just emits a broken URL — no exception is thrown, and **a test asserting only the
pretty case still passes**, so assert an ugly key instead (`app-role.service.spec.ts` uses
`'a/b role'`).

Applies to every string-PK service (`app-role`, `app-user` → `getById` / `delete`) and to
`course-detail`'s QR target, which encodes `CourseId` even though its own route key is the numeric
`pkid`. A numeric `pkid` route needs no encoding — say so in a comment, as `course.service.ts`,
`course-group.service.ts` and `featured-promo-item.service.ts` each do, so the omission reads as
deliberate rather than forgotten.

Scaffolding shape (route constraints, service signatures): `spec/code-gen.convention.md`.

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

`initial` is **~571 kB** against a `maximumWarning` of 500 kB, so `ng build --configuration
production` emits a budget **warning**. `maximumError` is 2 MB, so it still succeeds.

This is **not** a per-feature regression: feature components are lazy chunks and `main` barely moves
(+0.4 kB for routes/sidebar). The growth is shared PrimeNG internals landing in the common chunk the
initial bundle already references via `providePrimeNG` — Course first pulled in `p-select` /
`p-datepicker` / `p-tabs` / `p-checkbox` / `p-textarea` (491→501 kB), AppUser then added `p-tag` /
`p-multiselect` (501→511 kB). Each new PrimeNG primitive pushes it further.

The RowAudit badge added ~1.5 kB (516→517): `p-dialog` joined the shared PrimeNG internals.
The global error toast added ~54 kB (517→571): the shell (`app.ts`) now imports `ToastModule`
eagerly — a global toast cannot be a lazy chunk, same reason as the auth wiring below.

Auth added ~5 kB (511→516): `AuthService` / the interceptor / the guards are eagerly loaded from
`app.config.ts` and `app.routes.ts`, so unlike a feature they cannot be a lazy chunk. The login page
itself **is** lazy (~43 kB).

**Raise `maximumWarning` in `angular.json`** rather than hunting a regression; measure against a
stashed baseline before assuming otherwise.

## ⚠️ Print CSS: two hostile defaults

- **The app shell clips print.** `:host`/`.layout`/`.content` use `height: 100vh` + overflow, so
  anything printed from inside the shell truncates to ~one viewport. Any print feature needs a
  scoped `@media print` reset of the full `html` → `.content` height/overflow chain in global
  `styles.scss` — component styles can't reach body-level classes.
- **Chrome's print defaults fight branded output**: background graphics OFF by default (use
  borders, not background colors, + `print-color-adjust: exact`), the URL header/footer ON (a UX
  hint, not fixable from CSS), paper size overridable (design for A4, tolerate Letter). Verify
  against these settings, never the screen preview.

Worked example: `spec/course/CourseFlyer.md`, `app.scss`, `styles.scss`.
