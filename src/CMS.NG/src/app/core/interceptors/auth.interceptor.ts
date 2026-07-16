import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { environment } from '@env/environment';
import { AuthService } from '@core/services/auth.service';

/** Shown when a 5xx body carries no message (proxy errors, HTML error pages, empty bodies). */
const FALLBACK_SERVER_ERROR = '系統發生未預期的錯誤，請稍後再試。';

/**
 * Attaches `Authorization: Bearer <token>` to API calls, turns a 401 into a clean sign-out, and
 * surfaces 5xx failures as a global error toast (the ROOT MessageService feeds the app shell's
 * `<p-toast>` — see app.config.ts / app.html).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const messages = inject(MessageService);

  // 🔐 Only OUR api. The token must never ride along to another host: `environment` also holds
  // publicSiteUrl (uuu.com.tw), and a blanket header would hand our bearer token to a third party
  // on any request there — plus leak it to any asset/CDN fetch that goes through HttpClient.
  const isApiRequest = req.url.startsWith(environment.apiUrl);
  const token = auth.token;

  const outgoing =
    isApiRequest && token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && isApiRequest && !isLoginRequest(req)) {
        // The token is gone, expired, or was rejected: drop the session and start over. Guarded by
        // isLoginRequest so a wrong password — which the API also answers with 401 — shows an error
        // on the login page instead of bouncing the user off the page they are already on.
        auth.logout();
        void router.navigate(['/login'], { queryParams: returnUrlFor(router.url) });
      }

      if (error instanceof HttpErrorResponse && error.status >= 500 && isApiRequest) {
        // Unexpected server failure. The API's exception middleware guarantees the body is
        // { message: <generic safe text> } — show that. Other statuses stay untouched: 401 is the
        // sign-out above, and 400/409 are meaningful to the calling form, which handles them.
        messages.add({
          severity: 'error',
          summary: '系統錯誤 Server Error',
          detail: safeMessageFrom(error),
          life: 6000,
        });
      }

      return throwError(() => error);
    }),
  );
};

/** The middleware's message when present; a fixed fallback when the body is not our JSON shape. */
function safeMessageFrom(error: HttpErrorResponse): string {
  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return FALLBACK_SERVER_ERROR;
}

function isLoginRequest(req: HttpRequest<unknown>): boolean {
  return req.url.startsWith(`${environment.apiUrl}/auth/`);
}

/** Omit returnUrl when we are already on /login, so it cannot point back at itself. */
function returnUrlFor(currentUrl: string): { returnUrl?: string } {
  return currentUrl && !currentUrl.startsWith('/login') ? { returnUrl: currentUrl } : {};
}
