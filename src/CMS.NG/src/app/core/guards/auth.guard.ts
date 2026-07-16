import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ADMIN_ROLE } from '@core/models/auth.model';
import { AuthService } from '@core/services/auth.service';

/**
 * Blocks a route when there is no token in session storage, sending the user to /login and
 * remembering where they were headed.
 *
 * ⚠️ This is convenience, not security. A guard runs in the browser and anyone can bypass it; the
 * API's `[Authorize]` is the actual boundary. The guard exists so an expired session shows the login
 * page instead of a screenful of failed requests.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? true : loginRedirect(router, state.url);
};

/**
 * Additionally requires the Admin role — the 系統管理 routes.
 *
 * Mirrors `[Authorize(Roles = "Admin")]` on AppUsers/AppRoles/PublishStatuses so a non-Admin gets a
 * redirect rather than a page that renders and then fills with 403s. The API is what enforces it;
 * this only keeps the UI honest.
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return loginRedirect(router, state.url);

  // Signed in but not an Admin: send them home rather than to /login — logging in again would not
  // help, and a login prompt would imply it might.
  return auth.hasRole(ADMIN_ROLE) ? true : router.createUrlTree(['/courses']);
};

function loginRedirect(router: Router, returnUrl: string) {
  return router.createUrlTree(['/login'], { queryParams: { returnUrl } });
}
