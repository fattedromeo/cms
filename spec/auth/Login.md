# Build Spec for the Login API

- database schema: `.\database\auth.sql` (`AppUser`, `AppUserRole`, `SysConfig`)

## Summary

`POST /api/auth/login` authenticates against `AppUser` and issues a 24-hour HS256 JWT. It is **not**
a CRUD feature: no table of its own, no menu entry, no list/form UI. It is the read side of the
account data that `spec/auth/AppUser.md` administers.

| Item | Detail |
|------|--------|
| Route | `POST /api/auth/login` (lowercase per convention; routing is case-insensitive so `/api/Auth/login` also resolves) |
| Request | `{ userId, password }` — both `[Required]` |
| Success | `200` `{ userId, userName, accessToken }` |
| Failure | `401` `{ message: "invalid credentials" }` — identical for all three causes |
| Token | HS256, 24h, claims `sub` / `name` / `role`×N, no `iss`/`aud` |
| Signing key | `SysConfig['appConfig'].symmetricSecurityKey`, read at runtime |

## The checks

All three fail to the **same** generic 401, so the endpoint is not an account-enumeration oracle
("wrong password" would confirm the account exists; "disabled" would confirm the password was right):

1. `UserId` must exist — **case-insensitively** (see below).
2. `IsActive` must be true.
3. `SHA256(password)` must equal the stored `PasswordHash` (`PasswordHasher.Hash`, reused).

## Decisions

- **UserId matching is case-insensitive — decided with the user.** The column collation is
  `Chinese_Taiwan_Stroke_CI_AS`, so SQL `=` already matches `MILES@UUU.COM.TW` (and, per SQL's
  padding rules, `'miles@uuu.com.tw   '`). `UserId` is an email — conventionally case-insensitive —
  and this matches `AppUserRepository.GetByIdAsync`, so login and the CRUD screens agree on
  identity. "Match exactly" therefore reads as "whole-value match, no LIKE/prefix", not "ordinal".
  **Consequence**: the response and the `sub` claim echo the **stored** casing, not what was posted.
- **`IsActive` is enforced in the controller, not filtered out in SQL.** `WHERE ... AND IsActive = 1`
  would be equivalent in behaviour but would make the rule unreachable from a mocked-repo test —
  inactive and unknown would both surface as `null`. Carrying the flag on `UserCredential` keeps
  "disabled user cannot log in" covered by a real test.
- **A separate `IAuthRepository`/`AuthRepository`.** `IAppUserRepository`'s documented contract is
  that `PasswordHash` is *never* in a SELECT list; the credential read is the one exception, so it
  lives in its own repository rather than eroding that rule. `UserCredential` is its return type and
  sits in `Repositories/`, **not** `Models/` — everything in `Models/` is client-reachable.
- **Hash comparison normalises case + trailing space, then compares in constant time.** The column is
  a *case-insensitive* collation holding a hex digest, so SQL considers `AB12..` and `ab12..` the
  same value — an ordinal compare in C# would disagree and lock out such an account with a generic
  401 and no clue why. Case carries no information in hex, so normalising cannot weaken the check.
  `CryptographicOperations.FixedTimeEquals` keeps latency from leaking how many chars matched.
- **Short JWT claim names** (`sub`, `name`, `role`) via `JsonWebTokenHandler` +
  `SecurityTokenDescriptor.Claims`, which applies **no** outbound claim-type mapping — what goes in
  is what lands in the token. (The older `JwtSecurityTokenHandler` silently rewrites claim types.)
- **No `iss`/`aud`.** `appConfig` carries neither (verified: the JSON holds only `defaultPassword`,
  `enforcePasswordPolicy`, `symmetricSecurityKey`). Inventing values would be a fact not in the
  schema.
- **JSON parsed in C#, not `OPENJSON`.** The CMS database runs at **compatibility level 100**, where
  `OPENJSON` does not exist (verified: "Invalid object name 'OPENJSON'"). `SysConfigRepository`
  already parsed with `JsonDocument`; the new `symmetricSecurityKey` read shares that path.

## ⚠️ The signing key is exactly 32 bytes — the HS256 floor

`SysConfig['appConfig'].symmetricSecurityKey` is **32 characters / 32 UTF-8 bytes = 256 bits**,
exactly the minimum HS256 accepts, with **zero headroom**. Shortening that row by even one character
breaks *every* login at runtime, and a unit test with a mocked config would not notice — the mock
returns whatever fake key the test supplies.

`JwtTokenService` therefore length-checks the key and throws a message naming the cause instead of
the library's cryptic `IDX10653`. The message never quotes the key.

🔐 `ISysConfigRepository.GetSymmetricSecurityKeyAsync` returns the signing secret itself. It must
never be logged, echoed into an exception message, or returned from an endpoint; the only legitimate
use is constructing `SigningCredentials` / validation parameters.

**`ISigningKeyProvider` is the single owner of that key** — used by *both* `JwtTokenService`
(issuing) and JWT bearer validation, so "signed with the key we validate against" is structural
rather than two paths that happen to agree. If they diverged, the API would reject every token it had
just minted. It caches for `SigningKeyProvider.CacheTtl` (5 min): validation runs on every
authenticated request, so an uncached read would be a DB round-trip per request, while the TTL — as
opposed to caching forever — is what keeps rotation working without a redeploy. The key length is
checked there, once, for both paths.

## Verified against the dev DB (read-only)

Controller tests mock the repository and **cannot** catch SQL-semantics bugs, so the following was
exercised against the live `CMS` database — first with a read-only probe, then over HTTP against a
real build.

Read-only (SELECTs only, nothing written):

| Checked | Result |
|---------|--------|
| Credential SELECT + role join for `miles@uuu.com.tw` | `IsActive=True`, roles `[Admin, developer, User]`, hash 64 lowercase hex |
| `MILES@UUU.COM.TW` lookup | matches; returns stored casing `miles@uuu.com.tw` |
| `'miles@uuu.com.tw   '` (trailing spaces) | matches (SQL padding rules) |
| Unknown UserId | `null` → 401 |
| **Real 32-byte key signs + validates** | ✅ `alg=HS256`, `keyBytes=32`, signature validates |
| Real roles → role claims | `[Admin, developer, User]` |
| Token lifetime with real data | exactly `1.00:00:00` |
| Wrong password through the real repo | `401 {"message":"invalid credentials"}` |

Over HTTP, with two **temporary** users seeded with a known password (authorised by the user, then
deleted — a residue check confirmed `AppUser`/`AppUserRole` were left exactly as found). This is also
what proves the DI registrations resolve, which no unit test covers:

| Checked | Result |
|---------|--------|
| Valid active user | `200 {"userId","userName","accessToken"}` |
| Token payload | `{"exp":…,"iat":…,"nbf":…,"sub":"authtest@example.com","name":"Auth Test","role":["Admin","User"]}` |
| **`exp - iat`** | `1784181342 - 1784094942 = 86400` s = **exactly 24h** |
| Wrong password, same user | `401 {"message":"invalid credentials"}` |
| `IsActive=0` **with the correct password** | `401 {"message":"invalid credentials"}` |
| `AUTHTEST@EXAMPLE.COM` (uppercase) | `200`, echoes stored casing `authtest@example.com` |
| PasswordHash in the response | absent |
| Missing password | `400` |
| `/api/Auth/login` (the cased route) | resolves — routing is case-insensitive |
| `GET /api/app-users` | `200` — no regression |

## Known gaps

- **The hash format remains inferred, not confirmed** — unchanged from `spec/auth/AppUser.md`, and
  the one thing the seeded-user test above **cannot** settle: it proves the endpoint accepts a
  password whose SHA-256 hex matches the column, but the temp row's hash was written *by this
  verification*, so it only shows the login is self-consistent. Whether the **existing login app**
  stores SHA-256 hex is still unverified — the one real row's hash is not SHA256 of `defaultPassword`
  (that user changed their password), so it neither confirms nor refutes. Confirm against that app
  before production; `PasswordHasher.Hash` is still the only thing that would change, since the login
  check reuses it rather than re-implementing it.
- **`SqlException`/547 class of gap**: `AuthRepository`'s SQL is not unit-tested (no DB-integration
  harness exists), only probed as above.

## Validation and the login UI now exist

Bearer validation, the global authorization policy, the Angular login page, interceptor, guards and
the role-gated menu are all built. **See [`spec/auth/Authorization.md`](Authorization.md)** — this
file stays about issuing the token.

`AuthController` also hosts `PUT /api/auth/profile` — see [`spec/auth/Profile.md`](Profile.md).
⚠️ That is why **`[AllowAnonymous]` sits on the `Login` action, not the controller**: at class level
it would silently publish the profile endpoint.

## Not built (deliberately)

- **No refresh token, no logout/revocation.** A 24h token stays valid until it expires — logging out
  clears the browser's copy but does not invalidate the token, and disabling an account does not cut
  an already-issued session short.
- **No rate limiting / lockout.** Unsalted fast SHA-256 plus unlimited attempts is brute-forceable;
  the generic 401 does not mitigate that. (Recovery for a forgotten password now exists — an Admin
  can reset it to the default; see `spec/auth/AppUser.md`.)
