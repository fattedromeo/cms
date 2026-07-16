import { UserProfile } from '@core/models/auth.model';
import { AUTH_STORAGE_KEY } from '@core/services/auth.service';

/** Re-exported so specs import the key and the helpers from one place. */
export { AUTH_STORAGE_KEY as STORAGE_KEY };

/**
 * Builds a JWT-shaped token carrying the given roles.
 *
 * **The signature is deliberately fake.** The browser never verifies it — only the API does, using
 * the SysConfig key — so a client-side test needs no real signing. A test that needs a genuinely
 * signed token is testing the backend, and lives in `CMS.API.Tests`.
 *
 * Mirrors what `JwtTokenService` emits: `sub`, `name`, and `role` as an array (verified to stay an
 * array even for one role), with `role` omitted entirely when there are none.
 */
export function makeToken(roles: string[] = [], claims: Record<string, unknown> = {}): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      sub: 'miles@uuu.com.tw',
      name: 'Miles Sun',
      ...(roles.length ? { role: roles } : {}),
      ...claims,
    }),
  );
  return `${header}.${payload}.not-a-real-signature`;
}

/** A stored profile for a signed-in user with the given roles. */
export function makeProfile(roles: string[] = ['Admin']): UserProfile {
  return { userId: 'miles@uuu.com.tw', userName: 'Miles Sun', accessToken: makeToken(roles) };
}

/**
 * Seeds session storage. Must run **before** AuthService is first injected — it reads storage once
 * at construction to survive a page refresh, so seeding afterwards has no effect.
 */
export function signInAs(roles: string[] = ['Admin']): UserProfile {
  const profile = makeProfile(roles);
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

/** UTF-8 safe base64url, so a CJK `name` claim round-trips (btoa alone would throw on it). */
function base64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
