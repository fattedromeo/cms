# Build Spec for AppUser
- database schema: `.\database\auth.sql`

## Summary

`AppUser` is a CMS admin console login account. It is structurally a **twin of `AppRole`**: `pkid`
is `int IDENTITY` but display-only, and the clustered PK / FK target is `UserId` (nvarchar). It
carries an N-N to `AppRole` through `AppUserRole` — the same junction `AppRole` already manages from
the other side.

The distinguishing feature is `PasswordHash`, which is **backend-only**: never accepted from, nor
returned to, the frontend. On create it is derived server-side from `SysConfig.appConfig`'s
`defaultPassword`; on update it is never touched.

| Item | Detail |
|------|--------|
| Primary Key | **`UserId`** nvarchar(200) — clustered PK, the route key. `pkid` int IDENTITY is display-only (主代碼) |
| Foreign Keys | None outbound |
| Required Fields | `UserId`, `UserName`, `IsActive`, `PasswordHash` (server-derived) |
| N-N Relationships | `AppUserRole` — AppUser ↔ AppRole |
| Primary-Foreign Links | `AppUserRole.UserId` (managed inline as N-N) |
| Query Filters | keyword (`UserId`, `UserName`); `IsActive`; `RoleId` (N-N via EXISTS) |
| Default Sort | `UserId ASC` |

> **`pkid` is never the route key.** Per `spec/reference/features.md` (AppRole): "Apply the same
> reasoning to any table whose PK constraint is on a non-`pkid` column." Routes are
> `/api/app-users/{userId}` with
> `encodeURIComponent`, and `UserId` is `disable()`d in the edit form. Mirrors `AppRole`/`RoleId`.

---

## ⚠️ PasswordHash — security notes

### The rules (as specified)

1. **Never** in `AppUserRequest`, never in any Angular model, never in an API response, no form field.
2. **CREATE**: read `SysConfig.configValue` where `configKey = 'appConfig'` → parse the JSON →
   take `defaultPassword` → SHA-256 → store.
3. **UPDATE**: leave `PasswordHash` untouched (it is not in the UPDATE column list at all).

### `SysConfig.appConfig` contains a secret — do not expose it

The live value is:

```json
{
  "defaultPassword": "CMS4fun#",
  "symmetricSecurityKey": "cloud4fun#123456cloud4fun#123456",
  "enforcePasswordPolicy": true
}
```

`symmetricSecurityKey` is a **JWT signing secret**. Therefore:

- **No `SysConfig` controller, no lookup endpoint, no DTO that carries `configValue`.** The only
  access is `ISysConfigRepository.GetDefaultPasswordAsync()`, which returns *just* the one string.
- Never log `configValue`, and never include it in an exception message.
- The repository parses with `JsonDocument` and reads **only** the `defaultPassword` property.

### ⚠️ Unsalted SHA-256 is weak for passwords — flagged, implemented as specified

Plain SHA-256 has no salt and is designed to be *fast*, which is the opposite of what password
storage wants: it is cheap to brute-force and identical passwords produce identical hashes (so every
account seeded from `defaultPassword` shares one hash, and cracking one cracks all of them).
A password KDF (PBKDF2 / bcrypt / Argon2, all salted + slow) is the correct tool.

**Implemented as specified anyway**, because this must interoperate with the existing login system
rather than be chosen fresh — `PasswordHash` is `nvarchar(800)`, and the one existing row is
**64 lowercase hex chars**, exactly a SHA-256 hex digest:

```
miles@uuu.com.tw -> 2bdeebd243a0bdf0a19e6cb91ee369edff78c261d457ed7789108127797ac41c  (len 64)
```

> **Unverified:** that hash is **not** `SHA256("CMS4fun#")` in any encoding tried (UTF-8 hex,
> UTF-16 hex, base64), so the exact format could not be confirmed against real data — but that row
> has `PasswordUpdatedTime` set, i.e. the user changed their password away from the default, so a
> mismatch is expected and proves nothing either way. The 64-hex length is consistent with the
> instruction. **Before trusting this in production, confirm against the login app that it expects
> `SHA256(UTF8(password))` as lowercase hex**; if it disagrees, only `PasswordHasher.Hash` changes.

Chosen format: `Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(password))).ToLowerInvariant()`
→ 64 lowercase hex chars, matching the stored length.

### If `appConfig` / `defaultPassword` is missing

`CreateAsync` throws `InvalidOperationException` (→ 500). A silent fallback (empty string, or a
hard-coded password) would create an account with a **known or guessable** hash, which is worse than
failing loudly. The message names the config key only — never the value.

---

## Localization

### Chinese Table Name

- AppUser: 使用者
- Description: CMS 管理後台登入帳號

### Chinese Column Names

- pkid: 主代碼
- UserId: 使用者代碼
- UserName: 使用者名稱
- IsActive: 啟用
- PasswordHash: 密碼雜湊 — **backend only, never rendered**
- PasswordUpdatedTime: 密碼更新時間
- (N-N) Roles: 角色

---

## Required Fields

Required (NOT NULL):

| Column | Type | Notes |
|--------|------|-------|
| `UserId` | nvarchar(200) | clustered PK; immutable on edit |
| `UserName` | nvarchar(200) | |
| `IsActive` | bit | `DF_AppUser_IsActive` DEFAULT 1 → form default **true** |
| `PasswordHash` | nvarchar(800) | **server-derived on create; not user input** |

Optional (nullable):
- `PasswordUpdatedTime` — `datetime` NULL

`pkid` is `int IDENTITY` — excluded from INSERT, display-only.

---

## Foreign Keys

`AppUser` has no outbound FK columns. **N/A**

## Foreign-Primary Links

**N/A** — no outbound FKs.

## Primary-Foreign Links

`AppUserRole.UserId` → `AppUser.UserId` (`FK_AppUserRole_AppUser`, **no cascade**) is the only
inbound reference, and it is managed inline as an N-N relationship — no separate list-page link.

**N/A**

---

## N-N Relationships

### AppUserRole — AppUser ↔ AppRole

| Column | Type | Notes |
|--------|------|-------|
| `pkid` | int IDENTITY | surrogate key — excluded from INSERT |
| `UserId` | nvarchar(200) NOT NULL | FK → AppUser.UserId (composite PK with RoleId) |
| `RoleId` | nvarchar(200) NOT NULL | FK → AppRole.RoleId |

> **A surrogate `pkid` does not disqualify a junction table.** The rule in
> `spec/reference/backend.md` ("exactly two FK columns and nothing else") is about *payload*
> columns: `PartnerCourseGroup` is a first-class entity
> because it adds `DisplayOrder`/`Description`. `AppUserRole` adds only an IDENTITY surrogate, and
> `AppRoleRepository.ReplaceUsersAsync` **already treats it as a junction** — this build simply
> manages the same table from the user side.

- Request field: `RoleIds` — `List<string>`. Populated on GET-by-id.
- Form: `p-multiSelect`, `[maxSelectedLabels]="9999"`, `[filter]="true"` (2 roles today).
- List: show a 角色數 count column (mirrors `AppRole.UserCount` via a subquery).
- Lookup: `GET /api/lookups/app-roles` (**new**) — label = `RoleName`, order by `r.RoleId ASC`.
  `RoleId` is already a string → **no `CAST`**, so the ORDER BY alias-shadowing hazard does not
  apply here (it only bites when a numeric PK is cast to varchar). Still qualify out of habit.

### Sync pattern (create & update)

Delete-then-reinsert in the same transaction, mirroring `AppRoleRepository.ReplaceUsersAsync` but
keyed on `UserId`:

```sql
DELETE FROM AppUserRole WHERE UserId = @UserId;
INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @RoleId);  -- pkid is IDENTITY
```

The two sides are complementary (`AppRole` deletes `WHERE RoleId = @roleId`), so they do not fight.

---

## Query Filters

- **keyword**: LIKE on `UserId`, `UserName`.
- **IsActive**: `bool?` — tri-state (null = no filter).
- **RoleId**: `string?` — N-N filter:
  `EXISTS (SELECT 1 FROM AppUserRole ur WHERE ur.UserId = u.UserId AND ur.RoleId = @RoleId)`.
  Lookup `app-roles`, label `RoleName`.

No date-range filter on `PasswordUpdatedTime` — not a useful search axis for 1 admin user.

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/app-roles` | **New** | `LookupItem { pkid = RoleId, label = RoleName }`, order `r.RoleId ASC` |
| `GET /api/lookups/app-users` | **Exists** | already used by the AppRole form |

`LookupItem.Pkid` carries `RoleId` (a string) — consistent with `GetAppUsersAsync`, which puts
`UserId` in `Pkid`.

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/app-users` | List all (ORDER BY `UserId ASC`) |
| `POST` | `/api/app-users/query` | Filtered query (body: `AppUserQuery`) |
| `GET` | `/api/app-users/{id}` | Get by UserId (string route, `encodeURIComponent`) — 404 if missing |
| `POST` | `/api/app-users` | Create — 201; **PasswordHash derived server-side**; 409 if UserId exists |
| `PUT` | `/api/app-users` | Update (UserId from body) — 204 / 404 / 400. **Never touches PasswordHash** |
| `DELETE` | `/api/app-users/{id}` | Delete — 204 / 404 |

Route `{id}` has **no `:int` constraint** (string PK). No auth attributes — consistent with the
existing controllers.

> **Reset-password endpoint: NOT built in this pass** — see *Open Question* below.

---

## Backend Notes

### New shared pieces

```csharp
// Data/PasswordHasher.cs
/// SHA-256 over UTF-8, lowercase hex (64 chars) — matches the stored PasswordHash length.
/// NOTE: unsalted SHA-256 is weak for passwords; kept only to interoperate with the existing
/// login system. Replace with a salted KDF if/when that system moves.
public static class PasswordHasher
{
    public static string Hash(string password) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(password))).ToLowerInvariant();
}

// Repositories/ISysConfigRepository.cs
public interface ISysConfigRepository
{
    /// Reads SysConfig['appConfig'].defaultPassword. Returns ONLY that property — the same JSON
    /// also holds symmetricSecurityKey (a JWT signing secret) which must never leave the server.
    Task<string> GetDefaultPasswordAsync(CancellationToken ct = default);
}
```

`SysConfigRepository` parses with `JsonDocument`; throws `InvalidOperationException` when the row,
the property, or a non-empty value is absent. **No controller, no DTO, no endpoint.**

### Models

```csharp
// Models/AppUser.cs — NOTE: no PasswordHash property at all.
public class AppUser
{
    public int Pkid { get; set; }                     // display only (主代碼)
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime? PasswordUpdatedTime { get; set; }
    public int RoleCount { get; set; }                // subquery count, mirrors AppRole.UserCount
    public List<string> RoleIds { get; set; } = [];   // populated by GetByIdAsync only
}

// Models/AppUserRequest.cs — NOTE: no PasswordHash, no PasswordUpdatedTime.
public class AppUserRequest
{
    public int Pkid { get; set; }
    [Required, MaxLength(200)] public string UserId { get; set; } = string.Empty;
    [Required, MaxLength(200)] public string UserName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public List<string> RoleIds { get; set; } = [];
}

// Models/AppUserQuery.cs
public class AppUserQuery
{
    public string? Keyword { get; set; }   // LIKE on UserId, UserName
    public bool? IsActive { get; set; }
    public string? RoleId { get; set; }    // EXISTS against AppUserRole
}
```

> `PasswordHash` appears in **no** model. That is the enforcement mechanism: it cannot be bound from
> JSON, so no over-post can set it, and it cannot leak because it is never selected.

### SQL — SELECT

`PasswordHash` is **never in a SELECT list.** No `nchar` columns → no RTRIM.

```sql
SELECT u.pkid, u.UserId, u.UserName, u.IsActive, u.PasswordUpdatedTime,
       (SELECT COUNT(*) FROM AppUserRole ur WHERE ur.UserId = u.UserId) AS RoleCount
FROM AppUser u
ORDER BY u.UserId ASC;
```

`GetByIdAsync` adds `WHERE u.UserId = @userId` then fills `RoleIds` from a second query on the same
connection (mirrors `AppRoleRepository.GetByIdAsync`).

### SQL — INSERT (create)

```sql
INSERT INTO AppUser (UserId, UserName, IsActive, PasswordHash, PasswordUpdatedTime)
VALUES (@UserId, @UserName, @IsActive, @PasswordHash, @PasswordUpdatedTime);
SELECT CAST(SCOPE_IDENTITY() AS int);
```

`@PasswordHash` comes from `PasswordHasher.Hash(await _sysConfig.GetDefaultPasswordAsync(ct))` —
**never from the request**. Then sync `AppUserRole`. All inside one transaction.

### SQL — UPDATE

**`PasswordHash` and `PasswordUpdatedTime` are absent from the column list** — that is the rule,
expressed structurally rather than by a runtime guard:

```sql
UPDATE AppUser SET UserName = @UserName, IsActive = @IsActive WHERE UserId = @UserId;
```

Then re-sync `AppUserRole` in the same transaction.

### SQL — DELETE

`FK_AppUserRole_AppUser` does **not** cascade, so junction rows must be removed first — exactly like
`AppRoleRepository.DeleteAsync`:

```sql
DELETE FROM AppUserRole WHERE UserId = @userId;
DELETE FROM AppUser     WHERE UserId = @userId;
```

Both in one transaction. With the junction cleared first, 547 is not expected; the controller still
catches it → 409 (`此使用者仍被其他資料使用，無法刪除。`), consistent with the house pattern.

### Special column notes

- **`PasswordUpdatedTime` is the first `datetime` column used in the app.** It maps to
  `DateTime?` with **no Dapper type handler** — the `DateOnlyTypeHandler` added for `Course` is for
  `date`/`DateOnly` only; `datetime` ↔ `DateTime` is natively supported. See *Open Question* for what
  value create should write.
- Frontend display of `PasswordUpdatedTime` **must** append `'Z'`
  (`{{ u.passwordUpdatedTime + 'Z' | date:'yyyy/MM/dd HH:mm' }}`) — Dapper returns `datetime` with
  `Kind = Unspecified`, so the browser would otherwise read UTC as local
  (see `spec/reference/frontend.md`).

---

## Frontend Notes

### Route table

| Route | Component |
|-------|-----------|
| `/app-users` | `AppUserList` |
| `/app-users/new` | `AppUserForm` (add) |
| `/app-users/:id` | `AppUserDetail` |
| `/app-users/:id/edit` | `AppUserForm` (edit) |

`new` before `:id`. `:id` is a **string** (`UserId`) → `encodeURIComponent` in the service
(`UserId` is an email — `miles@uuu.com.tw` — so encoding is not optional).

### Angular model

No `passwordHash` field anywhere.

```ts
export interface AppUser {
  pkid: number;
  userId: string;
  userName: string;
  isActive: boolean;
  passwordUpdatedTime: string | null;  // datetime -> append 'Z' before parsing
  roleCount: number;
  roleIds: string[];
}
export interface AppUserRequest {
  pkid: number;
  userId: string;
  userName: string;
  isActive: boolean;
  roleIds: string[];
}
export interface AppUserQuery {
  keyword?: string | null;
  isActive?: boolean | null;
  roleId?: string | null;
}
```

### List component

Columns: 主代碼 (`pkid`, 6rem), 使用者代碼 (`userId`), 使用者名稱 (`userName`), 啟用 (`isActive`
→ 是/否, 6rem), 角色數 (`roleCount`, 7rem), 密碼更新時間 (`passwordUpdatedTime` + `'Z'`, 11rem),
操作 (9rem). Default sort `userId` ASC, `rows = 20`.

Filter drawer: 關鍵字 text; 啟用 `p-select` tri-state (不限/是/否); 角色 `p-select` from
`app-roles` (`optionValue="pkid"` carries `RoleId`, a string → **no `Number()` mapping**, unlike the
numeric-FK features).

Session keys: `app-user-list-filters | -sort | -page`.

### Form layout

Single card (7 controls — no tabs needed; the Course tab pattern is not warranted here).

| Field | Widget | Notes |
|-------|--------|-------|
| 主代碼 `pkid` | `p-inputNumber` | edit mode only, **disabled** (IDENTITY) |
| 使用者代碼 `userId` | `input pInputText` maxlength 200 | required; **`disable()`d in edit mode** (immutable PK) |
| 使用者名稱 `userName` | `input pInputText` maxlength 200 | required |
| 啟用 `isActive` | `p-checkbox [binary]="true"` | default **true** (DB default 1) |
| 角色 `roleIds` | `p-multiSelect` | optional |
| 密碼更新時間 | read-only text | edit mode only, display only |

**No password field in either mode.** Add mode shows a hint:
「新帳號將使用系統預設密碼，請提醒使用者首次登入後變更。」

### Detail component

`dl.detail-grid`: 主代碼 / 使用者代碼 / 使用者名稱 / 啟用 / 密碼更新時間 / 角色 (resolved labels
via the `app-roles` lookup). **No password row.** Toolbar 返回 / 編輯.

### Delete confirmation

```
確定要刪除使用者 <b>${item.userId}</b>「${item.userName}」？
此使用者的角色指派將一併被刪除。
```

(The junction rows are hand-deleted, so the copy says so — same honesty rule as Course.)

### Sidebar

`app.ts` already holds a **disabled placeholder**:
`{ label: '使用者', labelEn: 'AppUser', icon: 'pi pi-user', disabled: true }`.
Replace `disabled: true` with `route: '/app-users'` under 系統管理 Admin.

---

## Tests

### Backend — `CMS.API.Tests/AppUsersControllerTests.cs`

Mock `IAppUserRepository` (`MockBehavior.Strict`). Mirrors `AppRolesControllerTests`: list, query
(keyword / isActive / roleId), get-by-id found+missing, create (201 + invalid→400), update
(204/404/400), delete (204/404).

### Backend — `CMS.API.Tests/PasswordHasherTests.cs` (**new**)

Pure function, no DB — worth real coverage since it is security-relevant:
- produces 64 lowercase hex chars;
- is deterministic;
- differs for different inputs;
- matches a known SHA-256 vector (e.g. `"abc"` →
  `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`), pinning encoding + casing.

> `SysConfigRepository` JSON parsing is **not** unit-testable without a live DB (it takes
> `IDbConnectionFactory`, and the repo has no DB-integration test harness) — same class of gap as
> `SqlException`/547. Verify against the dev DB and note it here.

### Frontend

- `app-user.service.spec.ts` — asserts **`encodeURIComponent`** on `getById`/`delete`
  (`miles@uuu.com.tw` → `miles%40uuu.com.tw`), and that `create`/`update` bodies contain **no
  `passwordHash` key**.
- `app-user-list.spec.ts` — loads via query; renders roleCount; filters persist.
- `app-user-detail.spec.ts` — loads by encoded id; resolves role labels; renders no password.
- `app-user-form.spec.ts` — add mode invalid until userId+userName; `isActive` defaults true;
  edit mode patches, `userId` **disabled**; request payload has no `passwordHash`.

---

## Files to Create / Modify

### Backend (`src/CMS.API`)

| File | Action |
|------|--------|
| `Data/PasswordHasher.cs` | **Create** |
| `Repositories/ISysConfigRepository.cs` | **Create** |
| `Repositories/SysConfigRepository.cs` | **Create** (JSON parse; no controller) |
| `Models/AppUser.cs` / `AppUserRequest.cs` / `AppUserQuery.cs` | Create |
| `Repositories/IAppUserRepository.cs` / `AppUserRepository.cs` | Create |
| `Controllers/AppUsersController.cs` | Create |
| `Repositories/ILookupRepository.cs` + `LookupRepository.cs` | Modify — add `GetAppRolesAsync` |
| `Controllers/LookupsController.cs` | Modify — add `GET app-roles` |
| `Program.cs` | Modify — register `IAppUserRepository`, `ISysConfigRepository` |

### Frontend (`src/CMS.NG`)

| File | Action |
|------|--------|
| `core/models/app-user.model.ts` | Create |
| `core/services/app-user.service.ts` | Create |
| `features/app-users/app-user-{list,detail,form}/{ts,html,scss}` | Create |
| `app.routes.ts` | Modify — lazy `app-users` routes |
| `app.ts` | Modify — **enable the existing disabled 使用者 placeholder** |

### Tests

| File | Action |
|------|--------|
| `CMS.API.Tests/AppUsersControllerTests.cs` | Create |
| `CMS.API.Tests/PasswordHasherTests.cs` | Create |
| `core/services/app-user.service.spec.ts` | Create |
| `features/app-users/app-user-{list,detail,form}/*.spec.ts` | Create |

---

## Decided — reset-password endpoint deferred

The instruction says PasswordHash is untouched on update *"unless a separate reset-password endpoint
is called"*, which implies such an endpoint but does not ask for one. **Confirmed deferred — not
built in this pass.** Consequence to be aware of: there is no way to reset a forgotten password from
this console until it is built.

When wanted, the agreed shape is:

| Method | Route | Body | Behaviour |
|--------|-------|------|-----------|
| `POST` | `/api/app-users/{id}/reset-password` | none | Re-hash `SysConfig.appConfig.defaultPassword`, set `PasswordUpdatedTime = NULL`, return 204 |

Taking no body keeps a caller from setting an arbitrary password and keeps plaintext off the wire.

Related, **decided: `PasswordUpdatedTime` is written as `NULL` on create.** It is nullable, and
`appConfig` sets `enforcePasswordPolicy: true`, which suggests the login app may treat **NULL as
"still on the default password → force a change at first login"**. NULL is the safer reading: it does
not claim the user chose their password. (The one existing row has a value because that user actually
changed theirs.) Still worth confirming against the login app — if it instead expects a timestamp,
only the `@PasswordUpdatedTime` parameter in `CreateAsync` changes.
