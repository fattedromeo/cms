import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { App } from './app';
import { AuthService } from '@core/services/auth.service';
import { signInAs } from '@core/testing/auth-test-utils';

describe('App (shell)', () => {
  /**
   * Seeds the session BEFORE configuring the TestBed: AuthService reads session storage once when
   * it is constructed, so signing in afterwards would leave the shell thinking it is signed out.
   */
  function setup(roles: string[] | null) {
    sessionStorage.clear();
    if (roles) signInAs(roles);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // The shell's global <p-toast> needs animations and the root MessageService it listens to
        // (provided by app.config.ts in the real app).
        provideNoopAnimations(),
        MessageService,
      ],
    });

    const fixture = TestBed.createComponent(App);
    // Karma's headless browser window can be narrower than 768px, which would default
    // `collapsed` to true (FINDING-001's mobile behavior) and hide every nav label/link these
    // tests assert on. Pin an expanded baseline here — the responsive-default logic itself has
    // its own dedicated tests below.
    (fixture.componentInstance as unknown as { collapsed: { set(v: boolean): void } }).collapsed.set(
      false,
    );
    fixture.detectChanges();
    return fixture;
  }

  const navLinks = (fixture: ReturnType<typeof setup>) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.nav-item')).map(
      (a) => a.textContent ?? '',
    );

  const groupLabels = (fixture: ReturnType<typeof setup>) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.nav-group__label')).map(
      (e) => e.textContent ?? '',
    );

  afterEach(() => sessionStorage.clear());

  it('should create the app', () => {
    expect(setup(['Admin']).componentInstance).toBeTruthy();
  });

  it('should render the UWA brand when signed in', () => {
    const compiled = setup(['Admin']).nativeElement as HTMLElement;
    expect(compiled.querySelector('.sidebar__brand-text')?.textContent).toContain('UWA');
  });

  // --- The shell is only for signed-in users ------------------------------
  it('renders no sidebar or topbar when signed out', () => {
    // The login page must appear on its own — a sidebar full of links the user cannot use (and a
    // logout button for a session that does not exist) would be nonsense.
    const compiled = setup(null).nativeElement as HTMLElement;

    expect(compiled.querySelector('.sidebar')).toBeNull();
    expect(compiled.querySelector('.topbar')).toBeNull();
  });

  // --- Signed-in chrome ---------------------------------------------------
  it('shows the signed-in UserName in the header', () => {
    const compiled = setup(['User']).nativeElement as HTMLElement;

    expect(compiled.querySelector('.topbar__user-name')?.textContent).toContain('Miles Sun');
  });

  it('has a My Profile link in the shell', () => {
    const compiled = setup(['User']).nativeElement as HTMLElement;

    const links = Array.from(compiled.querySelectorAll<HTMLAnchorElement>('.topbar a'));
    expect(links.some((a) => a.getAttribute('href') === '/profile')).toBeTrue();
    expect(links.some((a) => (a.textContent ?? '').includes('個人資料'))).toBeTrue();
  });

  it('renders the UserName from the auth signal, so a rename updates the header live', () => {
    const fixture = setup(['User']);
    const auth = TestBed.inject(AuthService);
    expect((fixture.nativeElement as HTMLElement).querySelector('.topbar__user-name')?.textContent)
      .toContain('Miles Sun');

    // What Profile's save does via AuthService.updateProfile — the header must follow.
    (auth as unknown as { _profile: { set: (v: unknown) => void } })._profile.set({
      userId: 'miles@uuu.com.tw',
      userName: 'Renamed Live',
      accessToken: 'x.y.z',
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.topbar__user-name')?.textContent)
      .toContain('Renamed Live');
  });

  it('logout clears the session and leaves the shell', () => {
    const fixture = setup(['Admin']);
    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBeTrue();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.topbar__logout')!
      .click();
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBeFalse();
    expect(sessionStorage.getItem('cms-auth')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.sidebar')).toBeNull();
  });

  // --- 系統管理 Admin is role-gated ---------------------------------------
  it('shows 系統管理 Admin when the roles include Admin', () => {
    const fixture = setup(['Admin', 'developer', 'User']);

    expect(groupLabels(fixture).some((t) => t.includes('系統管理'))).toBeTrue();
    expect(navLinks(fixture).some((t) => t.includes('角色 AppRole'))).toBeTrue();
    expect(navLinks(fixture).some((t) => t.includes('使用者 AppUser'))).toBeTrue();
  });

  it('hides 系統管理 Admin when the roles do not include Admin', () => {
    const fixture = setup(['developer', 'User']);

    expect(groupLabels(fixture).some((t) => t.includes('系統管理'))).toBeFalse();
    // Its children must go too — hiding the group header alone would still leave the links.
    expect(navLinks(fixture).some((t) => t.includes('角色 AppRole'))).toBeFalse();
    expect(navLinks(fixture).some((t) => t.includes('使用者 AppUser'))).toBeFalse();
    expect(navLinks(fixture).some((t) => t.includes('發布狀態 PublishStatus'))).toBeFalse();
  });

  it('hides 系統管理 Admin for a user with no roles at all', () => {
    expect(groupLabels(setup([])).some((t) => t.includes('系統管理'))).toBeFalse();
  });

  it('is case-sensitive: "admin" does not unlock 系統管理', () => {
    // Agrees with the API, where [Authorize(Roles = "Admin")] compares ordinally — otherwise the
    // menu would offer pages the API then answers with 403.
    expect(groupLabels(setup(['admin'])).some((t) => t.includes('系統管理'))).toBeFalse();
  });

  it('still shows the non-admin groups to a non-Admin', () => {
    // Guards against over-filtering: only 系統管理 is gated.
    const fixture = setup(['User']);

    expect(groupLabels(fixture).some((t) => t.includes('課程管理'))).toBeTrue();
    expect(navLinks(fixture).some((t) => t.includes('課程 Course'))).toBeTrue();
  });

  it('toggleCollapsed flips the collapsed state', () => {
    const app = setup(['Admin']).componentInstance as unknown as {
      collapsed: () => boolean;
      toggleCollapsed: () => void;
    };
    expect(app.collapsed()).toBeFalse();
    app.toggleCollapsed();
    expect(app.collapsed()).toBeTrue();
  });

  // Regression: FINDING-001 — the sidebar rendered at its full 250px desktop width on mobile
  // viewports with no responsive behavior, squeezing the data table into an unusable ~130px
  // sliver. `collapsed` now defaults from window.innerWidth instead of a hardcoded false.
  // Found by /design-review on 2026-07-17.
  // Report: .gstack/design-reports/design-audit-localhost-4200-2026-07-17.md
  describe('responsive default', () => {
    function setupAtWidth(width: number) {
      spyOnProperty(window, 'innerWidth').and.returnValue(width);
      sessionStorage.clear();
      signInAs(['Admin']);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [App],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          provideNoopAnimations(),
          MessageService,
        ],
      });
      return TestBed.createComponent(App);
    }

    it('defaults to collapsed below the 768px breakpoint', () => {
      const fixture = setupAtWidth(375);
      fixture.detectChanges();
      const app = fixture.componentInstance as unknown as { collapsed: () => boolean };

      expect(app.collapsed()).toBeTrue();
    });

    it('defaults to expanded at or above the 768px breakpoint', () => {
      const fixture = setupAtWidth(1280);
      fixture.detectChanges();
      const app = fixture.componentInstance as unknown as { collapsed: () => boolean };

      expect(app.collapsed()).toBeFalse();
    });
  });
});
