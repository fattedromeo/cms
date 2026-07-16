import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '@env/environment';
import {
  ChangePasswordRequest,
  LoginRequest,
  ProfileResponse,
  UpdateProfileRequest,
  UserProfile,
} from '@core/models/auth.model';

/**
 * Session storage key. **Session, not local**: the profile must die with the browser tab, so a
 * shared machine cannot inherit a signed-in session from the last person.
 *
 * Exported so the specs assert against this exact key rather than a copy that could drift.
 */
export const AUTH_STORAGE_KEY = 'cms-auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  // Lowercase to match the other services' route style (api/app-users, api/lookups). The API route
  // is `api/auth`; ASP.NET routing is case-insensitive, so /api/Auth/login hits the same endpoint.
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  /** Seeded from session storage so a page refresh keeps the user signed in. */
  private readonly _profile = signal<UserProfile | null>(readStoredProfile());

  readonly profile = this._profile.asReadonly();
  readonly isAuthenticated = computed(() => !!this._profile()?.accessToken);
  readonly userName = computed(() => this._profile()?.userName ?? '');

  /**
   * Roles from the token's claims — never a separate API call, and never a stored field that could
   * drift from the token the API actually validates.
   */
  readonly roles = computed(() => rolesFromToken(this._profile()?.accessToken));

  /** Read synchronously by the HTTP interceptor, which cannot subscribe to a signal mid-request. */
  get token(): string | null {
    return this._profile()?.accessToken ?? null;
  }

  hasRole(role: string): boolean {
    return this.roles().includes(role);
  }

  login(request: LoginRequest): Observable<UserProfile> {
    return this.http
      .post<UserProfile>(`${this.baseUrl}/login`, request)
      .pipe(tap((profile) => this.store(profile)));
  }

  /**
   * Renames the signed-in user (個人資料 My Profile), then refreshes the stored profile so the shell
   * updates immediately — `userName` is a signal, so every reader re-renders.
   *
   * The API identifies the account from the token; the request carries only the name. The stored
   * `accessToken` is left as-is: its `name` claim goes stale until the next login, which is harmless
   * (nothing reads it — authorization uses `sub`/`role`, and the UI renders from the profile).
   */
  updateProfile(request: UpdateProfileRequest): Observable<ProfileResponse> {
    return this.http.put<ProfileResponse>(`${this.baseUrl}/profile`, request).pipe(
      tap((response) => {
        const current = this._profile();
        // Adopt the SERVER's value, not what was typed — the API trims, so echoing our own input
        // would leave the shell and the database showing different names.
        if (current) this.store({ ...current, userName: response.userName });
      }),
    );
  }

  /**
   * Changes the signed-in user's password. Returns 204 — nothing comes back.
   *
   * Deliberately does NOT touch the stored session: the caller decides what happens next (the
   * profile page signs the user out and sends them to /login). The API rejects with 400, never 401,
   * so a wrong current password will not trip the interceptor's sign-out.
   */
  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/change-password`, request);
  }

  /** Clears the session. Safe to call when already signed out (the 401 path may double-fire). */
  logout(): void {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    this._profile.set(null);
  }

  private store(profile: UserProfile): void {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(profile));
    this._profile.set(profile);
  }
}

function readStoredProfile(): UserProfile | null {
  const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    // Anything without a token is unusable — treat a corrupt/partial entry as signed out rather
    // than letting a profile with no token look authenticated.
    return parsed?.accessToken ? (parsed as UserProfile) : null;
  } catch {
    return null;
  }
}

/**
 * Reads the `role` claims out of a JWT payload.
 *
 * The payload is only base64url-encoded, not encrypted, so this needs no key — but it is also
 * **not a security check**: the API re-validates the signature on every request, and that is what
 * actually enforces anything. This only decides what the menu shows.
 */
function rolesFromToken(token: string | null | undefined): string[] {
  if (!token) return [];
  const parts = token.split('.');
  if (parts.length !== 3) return [];

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { role?: unknown };
    const role = payload.role;
    // The API emits an array even for a single role (verified: "role":["Admin"]), but a bare string
    // is the conventional JWT shape for one role, so accept both rather than silently dropping it.
    if (Array.isArray(role)) return role.map(String);
    if (typeof role === 'string') return [role];
    return [];
  } catch {
    return [];
  }
}

/**
 * base64url → UTF-8 text.
 *
 * `atob` alone yields a Latin-1 string, which mangles any non-ASCII claim — and UserName is CJK in
 * this app's target data (系統管理 users). The percent-decode round-trip reinterprets the bytes as
 * UTF-8. Roles happen to be ASCII, but decoding the payload correctly avoids a trap for whoever
 * reads another claim from here next.
 */
function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const percentEncoded = Array.from(binary)
    .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  return decodeURIComponent(percentEncoded);
}
