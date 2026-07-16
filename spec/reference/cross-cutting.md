# Cross-cutting conventions (Row Audit + exception handling)

Read before adding **any repository write** or **any detail/form page**. These are wired app-wide
once; a new feature only has to join in. Skipping a line fails silently — the feature works, and
the gap is only found later (an unaudited table, a leaked stack trace, a double toast).

## Row Audit — every repository write is audited

Writer `Services/RowAuditWriter` (`IRowAuditWriter`), history API `Controllers/RowAuditController`
(`GET /api/rowaudit?tableName=&pkid=`), badge `CMS.NG/src/app/shared/row-audit-badge/`.
Reference retrofit: `PublishStatusRepository` + `PublishStatusRepositoryAuditTests`;
`RowAuditWriterTests` pins the reflection rules.

### Repository checklist

- [ ] Inject `IRowAuditWriter`; every Insert/Update/Delete calls
      `LogInsertAsync` / `LogUpdateAsync` / `LogDeleteAsync` with the **real DB table name**, on the
      **same connection + transaction** as the write (the connection-bound overloads). Commit
      *after* the audit call — a failed/rolled-back change leaves no audit row, and vice versa.
      (The simple repositories gained transactions for exactly this; a 547-refused delete rolls the
      audit row back too.)
- [ ] **Update loads the row first** (snapshot), updates, snapshots again, passes both — the writer
      logs the comma-separated **changed column names**; nothing changed → no row.
- [ ] **Delete loads the row first** — after the DELETE its first string column (the ActionDesc
      source) is gone.
- [ ] **Snapshots select real columns + N-N pkid lists only.** No nav objects (two reads are never
      reference-equal → phantom "changed" columns on every update), no derived counts (they
      double-report the list they mirror), never a secret column (`PasswordHash`).
- [ ] Column rules: `ActionDesc` — Insert/Delete = value of the row's **first string-typed property
      in declaration order**, Update = changed column names; `PrimaryKeyValues` = pkid as a string;
      `UserName` = the JWT `name` claim, fallback `"system"`; `TableName` = the DB table name.
      **Never insert `RowAudit.pkid`** (IDENTITY). Values are truncated to column width, never
      allowed to throw after the business write succeeded.
- [ ] A non-CRUD write that changes a row is still an Update — `FeaturedPromoItemRepository.MoveAsync`
      audits the moved row, and both rows on a swap.

### Page checklist

- [ ] Every **detail page and form page** places
      `<app-row-audit-badge tableName="{Table}" [pkid]="..." />` in the page-header titles block —
      latest change inline, full trail in its dialog (the API returns newest first:
      `ORDER BY [DateTime] DESC, pkid DESC`, the IDENTITY pkid breaking same-3ms-tick ties).
- [ ] Forms bind a `recordPkid` signal set when the record loads and left `null` in create mode —
      null pkid = no fetch, neutral "no history" state.
- [ ] Host-page specs need `provideHttpClient() + provideHttpClientTesting()` for the badge's service.

### Known facts

- ⚠️ **`RowAudit.DateTime` is server-LOCAL (`DateTime.Now`)** — the one `datetime` the frontend must
  **not** append `'Z'` to (frontend.md's `datetime` rule does not apply to this column). Documented
  on both `RowAuditEntry` (C#) and `row-audit.model.ts`.
- `ActionDesc` is `varchar(1000)` (non-Unicode): CJK logged there may transcode lossily. Schema
  fact, known and accepted.
- Password writes (`AuthRepository.UpdatePasswordAsync`) are deliberately **not** audited — scoped
  to the CRUD repositories; revisit if 變更密碼/reset must appear in the trail.

## Exception handling — one 500 shape, no leaks

Middleware `Middleware/ExceptionHandlingMiddleware` — **FIRST in the pipeline**, Development
included, so the error contract the frontend depends on is exercised before production. Interceptor
5xx branch in `core/interceptors/auth.interceptor.ts`. Proof:
`ExceptionHandlingMiddlewareTests` + `ExceptionHandlingIntegrationTests` + the interceptor spec.

### Backend checklist

- [ ] **No per-controller try/catch for unexpected errors** — the middleware logs the full exception
      (`LogError(ex, …)`: message + stack + inner chain) and answers
      `500 { message: ExceptionHandlingMiddleware.GenericMessage }`. Still catch *specific expected*
      exceptions where they are handled today (`SqlException` 547 → 409 stays in the controller).
- [ ] Never let a response carry a stack trace, SQL text, exception type or connection details —
      assert **absence** in tests, as `ExceptionHandlingIntegrationTests` does (it also proves two
      different failures produce byte-identical bodies).
- [ ] 401 (challenge), 403, and validation 400s keep their existing shapes — the middleware only
      converts *thrown* exceptions, and nothing may start throwing to signal those.
- [ ] Edge behaviour is deliberate: a cancelled request rethrows (client gone ≠ server fault); a
      started response rethrows rather than writing a half-true body.

### Frontend checklist

- [ ] The interceptor already toasts every **API** 5xx through the **root** `MessageService` → the
      shell's global `<p-toast>` (feature pages' component-provided MessageService instances are
      separate — no crossover). Pages must **not** add their own generic-500 toast; local handling
      is for field/validation errors only.
- [ ] 401 keeps signing out → `/login`; 400/409 keep flowing to the calling form.
- [ ] Non-JSON 5xx bodies (proxy HTML) fall back to the fixed message — never render
      `[object Object]` or raw HTML in the toast. Network-down (status 0) deliberately shows
      nothing yet.
- Cost note: the global toast moved `ToastModule` into the eager shell bundle (+54 kB initial; see
  frontend.md's budget section).
