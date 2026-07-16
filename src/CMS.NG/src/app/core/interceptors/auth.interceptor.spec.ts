import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { environment } from '@env/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '@core/services/auth.service';
import { makeToken, STORAGE_KEY } from '@core/testing/auth-test-utils';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: Router;
  let messages: MessageService;
  const apiUrl = `${environment.apiUrl}/courses`;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        // Same role as the root provider in app.config.ts: the channel to the shell's <p-toast>.
        MessageService,
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    messages = TestBed.inject(MessageService);
    spyOn(router, 'navigate');
    spyOn(messages, 'add');
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  /** Seeds a signed-in session BEFORE AuthService is first injected (it reads storage on init). */
  function signIn(roles: string[] = ['Admin']): string {
    const accessToken = makeToken(roles);
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun', accessToken }),
    );
    return accessToken;
  }

  it('attaches Authorization: Bearer <token> to API requests', () => {
    const token = signIn();

    http.get(apiUrl).subscribe();

    const req = httpMock.expectOne(apiUrl);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    req.flush([]);
  });

  it('sends no Authorization header when signed out', () => {
    http.get(apiUrl).subscribe();

    const req = httpMock.expectOne(apiUrl);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });

  it('does NOT attach the token to non-API hosts', () => {
    // 🔐 The token must never leak to another origin. environment.publicSiteUrl is a real third
    // party (uuu.com.tw) that the app already knows about, so a blanket header would hand it our
    // bearer token.
    signIn();

    http.get(environment.publicSiteUrl).subscribe();

    const req = httpMock.expectOne(environment.publicSiteUrl);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('clears session storage and redirects to /login on a 401', () => {
    signIn();
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();

    http.get(apiUrl).subscribe({ error: () => undefined });
    httpMock.expectOne(apiUrl).flush('nope', { status: 401, statusText: 'Unauthorized' });

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], jasmine.any(Object));
  });

  it('rethrows the 401 so the caller still sees the error', () => {
    signIn();
    let status: number | undefined;

    http.get(apiUrl).subscribe({ error: (e: { status: number }) => (status = e.status) });
    httpMock.expectOne(apiUrl).flush('nope', { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
  });

  it('does NOT redirect when the LOGIN call itself 401s', () => {
    // A wrong password is also a 401. Redirecting here would bounce the user off the login page
    // they are already on and swallow the "bad credentials" message.
    const loginUrl = `${environment.apiUrl}/auth/login`;

    http.post(loginUrl, { userId: 'x', password: 'y' }).subscribe({ error: () => undefined });
    httpMock.expectOne(loginUrl).flush('bad', { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('leaves the session alone on a non-401 error', () => {
    signIn();

    http.get(apiUrl).subscribe({ error: () => undefined });
    httpMock.expectOne(apiUrl).flush('boom', { status: 500, statusText: 'Server Error' });

    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not sign the user out on a 403', () => {
    // 403 means "signed in, not allowed" — re-authenticating would not help, so the session stands.
    signIn(['User']);

    http.get(apiUrl).subscribe({ error: () => undefined });
    httpMock.expectOne(apiUrl).flush('forbidden', { status: 403, statusText: 'Forbidden' });

    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  // --- 5xx → friendly toast --------------------------------------------------

  it('shows a friendly error toast with the safe message from a 500 body', () => {
    signIn();

    http.get(apiUrl).subscribe({ error: () => undefined });
    httpMock
      .expectOne(apiUrl)
      .flush({ message: '系統發生未預期的錯誤，請稍後再試。' }, { status: 500, statusText: 'Server Error' });

    expect(messages.add).toHaveBeenCalledWith(
      jasmine.objectContaining({
        severity: 'error',
        detail: '系統發生未預期的錯誤，請稍後再試。',
      }),
    );
    // ...and the session is untouched: a server fault is not a sign-out.
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('falls back to a fixed message when the 5xx body is not our JSON shape', () => {
    // A proxy/host error answers with HTML or plain text, not the middleware's { message } —
    // the toast must not show "[object Object]" or raw HTML.
    signIn();

    http.get(apiUrl).subscribe({ error: () => undefined });
    httpMock
      .expectOne(apiUrl)
      .flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });

    expect(messages.add).toHaveBeenCalledWith(
      jasmine.objectContaining({
        severity: 'error',
        detail: '系統發生未預期的錯誤，請稍後再試。',
      }),
    );
  });

  it('still rethrows the 500 so the calling page sees the error too', () => {
    signIn();
    let status: number | undefined;

    http.get(apiUrl).subscribe({ error: (e: { status: number }) => (status = e.status) });
    httpMock.expectOne(apiUrl).flush({ message: 'x' }, { status: 500, statusText: 'Server Error' });

    expect(status).toBe(500);
  });

  it('shows NO toast on a 401 — that path signs out and redirects instead', () => {
    signIn();

    http.get(apiUrl).subscribe({ error: () => undefined });
    httpMock.expectOne(apiUrl).flush('nope', { status: 401, statusText: 'Unauthorized' });

    expect(messages.add).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], jasmine.any(Object));
  });

  it('shows NO toast on a 400 — validation errors belong to the form', () => {
    signIn();

    http.get(apiUrl).subscribe({ error: () => undefined });
    httpMock.expectOne(apiUrl).flush({ errors: { UserId: ['required'] } }, { status: 400, statusText: 'Bad Request' });

    expect(messages.add).not.toHaveBeenCalled();
  });

  it('shows NO toast for a 5xx from a non-API host', () => {
    signIn();

    http.get(environment.publicSiteUrl).subscribe({ error: () => undefined });
    httpMock.expectOne(environment.publicSiteUrl).flush('down', { status: 500, statusText: 'Server Error' });

    expect(messages.add).not.toHaveBeenCalled();
  });
});
