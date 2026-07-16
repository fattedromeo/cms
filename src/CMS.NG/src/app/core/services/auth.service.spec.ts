import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { AUTH_STORAGE_KEY, AuthService } from './auth.service';
import { UserProfile } from '@core/models/auth.model';
import { makeToken, signInAs } from '@core/testing/auth-test-utils';

describe('AuthService', () => {
  let httpMock: HttpTestingController;
  const loginUrl = `${environment.apiUrl}/auth/login`;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    localStorage.clear();
  });

  function login(roles: string[] = ['Admin', 'User']): { service: AuthService; profile: UserProfile } {
    const service = TestBed.inject(AuthService);
    const profile: UserProfile = {
      userId: 'miles@uuu.com.tw',
      userName: 'Miles Sun',
      accessToken: makeToken(roles),
    };
    service.login({ userId: 'miles@uuu.com.tw', password: 'P@ssw0rd!' }).subscribe();
    const req = httpMock.expectOne(loginUrl);
    expect(req.request.method).toBe('POST');
    req.flush(profile);
    return { service, profile };
  }

  it('posts { userId, password } to the login endpoint', () => {
    const service = TestBed.inject(AuthService);
    service.login({ userId: 'miles@uuu.com.tw', password: 'P@ssw0rd!' }).subscribe();

    const req = httpMock.expectOne(loginUrl);
    expect(req.request.body).toEqual({ userId: 'miles@uuu.com.tw', password: 'P@ssw0rd!' });
    req.flush({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun', accessToken: makeToken() });
  });

  it('stores the profile in SESSION storage on success', () => {
    const { profile } = login();

    expect(JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY)!)).toEqual(profile);
  });

  it('does NOT touch local storage', () => {
    // Explicit: the session must not outlive the tab on a shared machine.
    login();

    expect(localStorage.length).toBe(0);
  });

  it('exposes the signed-in user', () => {
    const { service } = login();

    expect(service.isAuthenticated()).toBeTrue();
    expect(service.userName()).toBe('Miles Sun');
    expect(service.token).not.toBeNull();
  });

  it('reads roles from the token claims', () => {
    const { service } = login(['Admin', 'developer', 'User']);

    expect(service.roles()).toEqual(['Admin', 'developer', 'User']);
    expect(service.hasRole('Admin')).toBeTrue();
    expect(service.hasRole('Nope')).toBeFalse();
  });

  it('reads roles with no extra API call', () => {
    login(['Admin']);

    // httpMock.verify() in afterEach is the assertion: any roles request would fail it.
    expect(TestBed.inject(AuthService).hasRole('Admin')).toBeTrue();
  });

  it('handles a token with no role claim', () => {
    const { service } = login([]);

    expect(service.roles()).toEqual([]);
    expect(service.hasRole('Admin')).toBeFalse();
  });

  it('accepts a bare-string role claim as well as an array', () => {
    // Our API always emits an array, but a scalar is the conventional JWT shape for a single role.
    const service = TestBed.inject(AuthService);
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush({
      userId: 'u',
      userName: 'U',
      accessToken: makeToken([], { role: 'Admin' }),
    });

    expect(service.roles()).toEqual(['Admin']);
  });

  it('restores the session from storage on construction (survives refresh)', () => {
    signInAs(['Admin']);

    const service = TestBed.inject(AuthService);

    expect(service.isAuthenticated()).toBeTrue();
    expect(service.hasRole('Admin')).toBeTrue();
  });

  it('logout clears storage and signs out', () => {
    const { service } = login();

    service.logout();

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token).toBeNull();
    expect(service.roles()).toEqual([]);
  });

  it('treats corrupt stored JSON as signed out', () => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, '{not json');

    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
  });

  it('treats a malformed token as having no roles rather than throwing', () => {
    const service = TestBed.inject(AuthService);
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush({ userId: 'u', userName: 'U', accessToken: 'garbage' });

    expect(service.roles()).toEqual([]);
    expect(service.isAuthenticated()).toBeTrue(); // a token we cannot read is still the API's to judge
  });

  it('decodes a non-ASCII name claim without mangling it', () => {
    // UserName is CJK in this app's target data; a naive atob would return mojibake.
    const service = TestBed.inject(AuthService);
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush({
      userId: 'u',
      userName: '孫小明',
      accessToken: makeToken(['Admin'], { name: '孫小明' }),
    });

    expect(service.userName()).toBe('孫小明');
    expect(service.roles()).toEqual(['Admin']);
  });

  // --- updateProfile ------------------------------------------------------
  it('updateProfile PUTs only the userName and refreshes the stored profile', () => {
    const { service } = login(['Admin']);
    const tokenBefore = service.token;

    service.updateProfile({ userName: 'Miles S.' }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/profile`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ userName: 'Miles S.' });
    req.flush({ userId: 'miles@uuu.com.tw', userName: 'Miles S.' });

    expect(service.userName()).toBe('Miles S.');
    expect(JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY)!).userName).toBe('Miles S.');
    // The token is untouched: its `name` claim goes stale, which is harmless (nothing reads it —
    // authorization uses sub/role, and the UI renders from the profile).
    expect(service.token).toBe(tokenBefore);
    expect(service.roles()).toEqual(['Admin']);
  });

  it('updateProfile takes the SERVER value, not the posted one', () => {
    const { service } = login();

    service.updateProfile({ userName: '  padded  ' }).subscribe();
    httpMock
      .expectOne(`${environment.apiUrl}/auth/profile`)
      .flush({ userId: 'miles@uuu.com.tw', userName: 'padded' });

    expect(service.userName()).toBe('padded');
  });

  it('updateProfile leaves the session alone on failure', () => {
    const { service } = login();

    service.updateProfile({ userName: '' }).subscribe({ error: () => undefined });
    httpMock
      .expectOne(`${environment.apiUrl}/auth/profile`)
      .flush('bad', { status: 400, statusText: 'Bad Request' });

    expect(service.userName()).toBe('Miles Sun');
  });

  it('does not store anything when login fails', () => {
    const service = TestBed.inject(AuthService);
    service.login({ userId: 'u', password: 'bad' }).subscribe({ error: () => undefined });
    httpMock.expectOne(loginUrl).flush('no', { status: 401, statusText: 'Unauthorized' });

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
  });
});
