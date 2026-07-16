# Auth — sub-system notes

Orientation for the `auth` sub-system: what it is made of and **which doc owns each fact**.

> **This file is an index, not a source of truth.** It deliberately states no rule, threshold or
> column detail — those live in the docs linked below, and duplicating them here would create a
> second copy to drift out of sync (the hazard `CLAUDE.md`'s first non-negotiable is about). If you
> come here to *add* a fact, add it to the owning doc and link it instead.
>
> As always: `database/auth.sql` is the truth. Read it first.

## Tables

Schema: `database/auth.sql`. (`AppRole` is also defined, identically, in `database/admin.sql`.)

| Table | Is | Detail lives in |
|-------|-----|-----------------|
| `AppUser` | A console login account | [`spec/auth/AppUser.md`](../auth/AppUser.md) |
| `AppRole` | A role a user can hold | [`features.md#approle`](../reference/features.md#approle) — no build spec of its own |
| `AppUserRole` | N-N junction, AppUser ↔ AppRole | Both specs above (each side manages it independently) |
| `SysConfig` | Key/value app config — **holds secrets** | [`spec/auth/Login.md`](../auth/Login.md), [`backend.md`](../reference/backend.md) |

## Features built on them

| Feature | Is | Spec |
|---------|-----|------|
| AppUser CRUD | 系統管理 → 使用者 | [`spec/auth/AppUser.md`](../auth/AppUser.md) |
| AppRole CRUD | 系統管理 → 角色 | [`features.md#approle`](../reference/features.md#approle) |
| Login API | `POST /api/auth/login` → JWT | [`spec/auth/Login.md`](../auth/Login.md) |
| JWT authorization | Bearer validation, login page, guards, role-gated menu | [`spec/auth/Authorization.md`](../auth/Authorization.md) |
| My Profile | 個人資料 — the signed-in user renames themselves **and** 變更密碼 changes their own password | [`spec/auth/Profile.md`](../auth/Profile.md) |
| Reset password to default | 重設密碼為預設值 — an **Admin** resets *another* user to the SysConfig default (button on the AppUser edit form) | [`spec/auth/AppUser.md`](../auth/AppUser.md) |

Every feature here also has a one-line entry in
[`spec/reference/features.md`](../reference/features.md) — read it before modifying one.

## The traps to know before touching anything here

Each is a **silent** failure — no exception, and often a passing test — and each is stated in full,
with its reasoning, in the linked doc. These lines are only the trigger to go read it.

- **🔐 `SysConfig['appConfig']` holds a JWT signing key and the default password.** There is no
  SysConfig controller, DTO or lookup, and there must not be one; the default password is never
  printed, logged, or returned either → `backend.md`, `Login.md`, `AppUser.md`.
- **🔐 `AppUser.PasswordHash` has no DTO property anywhere.** It is read only by `AuthRepository`
  (login + the password writes), never selected into a `Models/` type → `AppUser.md`, `Login.md`,
  `backend.md`.
- **⚠️ `MapInboundClaims` defaults to true and silently 403s every Admin** — the costliest trap in
  this sub-system, and it throws no error → `Authorization.md`.
- **⚠️ `[AllowAnonymous]` on a controller defeats `[Authorize]` on its actions**, and a 401 does not
  prove otherwise → `Authorization.md`.
- **⚠️ A hidden menu item / route guard / hidden button is NOT access control.** 系統管理 and the
  Admin password-reset are enforced by `[Authorize(Roles = "Admin")]` on the API (403); the sidebar,
  `adminGuard` and the button only mirror it → `Authorization.md`, `AppUser.md`.
- **⚠️ A 401 from any endpoint signs the user out** (the interceptor clears the session), so use it
  *only* for "not signed in" — a wrong **current** password is a 400 → `Profile.md`,
  `Authorization.md`.

## Open questions

Tracked in the owning docs, not here:

- Whether the existing login app really stores SHA-256 hex — the hash format is **inferred, not
  confirmed** → `Login.md` (Known gaps), `AppUser.md`.
- No notification or audit trail when an Admin resets someone's password (the timestamp is
  deliberately NULL, and nothing writes `RowAudit`) → `AppUser.md`.
- Logout does not revoke the token; no refresh token; no rate limiting (including the
  change-password current-password check); a new password may repeat the old one → `Authorization.md`,
  `Login.md`, `Profile.md` (Not built / Known gaps).
