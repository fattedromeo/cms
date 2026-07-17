import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './auth.guard';
import { signInAs } from '@core/testing/auth-test-utils';

describe('auth guards', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  /** Guards are CanActivateFn, so they must run inside an injection context. */
  function run(guard: typeof authGuard, url: string) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  }

  describe('authGuard', () => {
    it('redirects to /login when there is no token in session storage', () => {
      const result = run(authGuard, '/courses');

      const tree = result as UrlTree;
      expect(tree instanceof UrlTree).toBeTrue();
      expect(tree.toString()).toContain('/login');
    });

    it('preserves where the user was headed as returnUrl', () => {
      const tree = run(authGuard, '/courses/42/edit') as UrlTree;

      expect(tree.queryParams['returnUrl']).toBe('/courses/42/edit');
    });

    it('allows the route when a token is present', () => {
      signInAs(['User']);

      expect(run(authGuard, '/courses')).toBeTrue();
    });

    it('redirects when the stored profile has no token', () => {
      // A half-written entry must read as signed out, not as "authenticated with undefined".
      sessionStorage.setItem('cms-auth', JSON.stringify({ userId: 'x', userName: 'y' }));

      expect(run(authGuard, '/courses') instanceof UrlTree).toBeTrue();
    });
  });

  describe('adminGuard', () => {
    it('allows an Admin', () => {
      signInAs(['Admin', 'developer', 'User']);

      expect(run(adminGuard, '/app-users')).toBeTrue();
    });

    it('sends a signed-in non-Admin home, not to /login', () => {
      // Logging in again would not grant the role, so a login prompt would be a dead end.
      signInAs(['User', 'developer']);

      const tree = run(adminGuard, '/app-users') as UrlTree;
      expect(tree.toString()).toContain('/courses');
      expect(tree.toString()).not.toContain('/login');
    });

    it('sends a signed-out user to /login', () => {
      const tree = run(adminGuard, '/app-users') as UrlTree;

      expect(tree.toString()).toContain('/login');
    });

    it('is case-sensitive: "admin" is not "Admin"', () => {
      // Matches the API, where claims compare ordinally — so the two sides agree about a
      // differently-cased RoleId rather than the UI showing a page the API then refuses.
      signInAs(['admin']);

      expect(run(adminGuard, '/app-users') instanceof UrlTree).toBeTrue();
    });
  });

  describe('guestGuard', () => {
    // Regression: an already-authenticated user hitting /login (stale bookmark, back button)
    // used to render the login form stacked on top of the shell, since app.html shows the shell
    // purely off isAuthenticated() while the router still resolved /login with no guard.
    // Found by /qa on 2026-07-17
    // Report: .gstack/qa-reports/qa-report-localhost-4200-2026-07-17.md
    it('sends an already-authenticated user to /courses instead of rendering /login', () => {
      signInAs(['User']);

      const tree = run(guestGuard, '/login') as UrlTree;
      expect(tree instanceof UrlTree).toBeTrue();
      expect(tree.toString()).toContain('/courses');
    });

    it('allows a signed-out user to reach /login', () => {
      expect(run(guestGuard, '/login')).toBeTrue();
    });

    it('redirects when the stored profile has no token', () => {
      // Same half-written-entry edge case authGuard covers: must read as signed out.
      sessionStorage.setItem('cms-auth', JSON.stringify({ userId: 'x', userName: 'y' }));

      expect(run(guestGuard, '/login')).toBeTrue();
    });
  });
});
