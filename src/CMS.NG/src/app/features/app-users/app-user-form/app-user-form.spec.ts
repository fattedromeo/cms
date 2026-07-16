import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfirmationService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { AppUserForm } from './app-user-form';
import { AppUserService } from '@core/services/app-user.service';
import { AppUser } from '@core/models/app-user.model';
import { signInAs } from '@core/testing/auth-test-utils';

const sample: AppUser = {
  pkid: 8,
  userId: 'miles@uuu.com.tw',
  userName: 'Miles Sun',
  isActive: true,
  passwordUpdatedTime: '2026-06-04T12:49:14.023',
  roleCount: 2,
  roleIds: ['Admin', 'User'],
};

/**
 * @param id       route param — null renders the 新增 form
 * @param roles    the signed-in user's roles; seeded into session storage BEFORE the TestBed builds,
 *                 because AuthService reads storage once at construction.
 */
function setup(id: string | null, roles: string[] = ['Admin', 'User']) {
  sessionStorage.clear();
  signInAs(roles);

  const service = jasmine.createSpyObj<AppUserService>('AppUserService', [
    'getById',
    'create',
    'update',
    'getRoleOptions',
    'resetPasswordToDefault',
  ]);
  service.getById.and.returnValue(of(sample));
  service.create.and.returnValue(of(sample));
  service.update.and.returnValue(of(void 0));
  service.resetPasswordToDefault.and.returnValue(of(void 0));
  service.getRoleOptions.and.returnValue(
    of([
      { pkid: 'Admin', label: 'Administrator' },
      { pkid: 'User', label: 'User' },
    ]),
  );
  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

  TestBed.configureTestingModule({
    imports: [AppUserForm],
    providers: [
      provideNoopAnimations(),
      // AuthService (for the Admin check) is a real service over HttpClient; nothing here calls the
      // API, so the testing backend just satisfies the injection.
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AppUserService, useValue: service },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<AppUserForm> = TestBed.createComponent(AppUserForm);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, router };
}

/** The 重設密碼 button, or null when it is not rendered. */
const resetButton = (fixture: ComponentFixture<AppUserForm>) =>
  (fixture.nativeElement as HTMLElement).querySelector('[data-testid="reset-password"]');

/**
 * The component's OWN ConfirmationService.
 *
 * It is in the component's `providers`, so it lives in the component injector — `TestBed.inject`
 * would look in the module injector and not find it.
 */
const confirmationOf = (fixture: ComponentFixture<AppUserForm>) =>
  fixture.debugElement.injector.get(ConfirmationService);

/** Runs the confirm dialog's accept callback, standing in for the user clicking 重設密碼. */
function acceptConfirm(fixture: ComponentFixture<AppUserForm>) {
  const confirmation = confirmationOf(fixture);
  let accept: (() => void) | undefined;
  // Intercept rather than render the dialog: this is about what confirming DOES.
  spyOn(confirmation, 'confirm').and.callFake((options) => {
    accept = options.accept as () => void;
    return confirmation;
  });
  (fixture.componentInstance as unknown as { resetPassword: () => void }).resetPassword();
  accept?.();
}

describe('AppUserForm — add mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('is in add mode and invalid until userId and userName are filled', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['form'].invalid).toBeTrue();
  });

  it('defaults isActive to true (matching the DB default)', () => {
    const { component } = setup(null);
    expect(component['form'].getRawValue().isActive).toBeTrue();
  });

  it('does not call the service when the form is invalid', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('renders no password input and explains the default password', () => {
    const { fixture } = setup(null);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[type="password"]')).toBeNull();
    expect(el.textContent).toContain('新帳號將使用系統預設密碼');
  });

  it('creates with pkid 0 and no password field in the payload', () => {
    const { component, service, router } = setup(null);
    component['form'].patchValue({
      userId: 'new@example.com',
      userName: 'New User',
      roleIds: ['User'],
    });
    component['save']();

    expect(service.create).toHaveBeenCalled();
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(0);
    expect(arg.userId).toBe('new@example.com');
    expect(arg.roleIds).toEqual(['User']);
    // The password is server-derived — it must not appear in the request at all.
    expect(Object.keys(arg)).not.toContain('passwordHash');
    expect(Object.keys(arg)).not.toContain('passwordUpdatedTime');
    expect(router.navigate).toHaveBeenCalledWith(['/app-users', 'new@example.com']);
  });

  it('trims userId and userName before sending', () => {
    const { component, service } = setup(null);
    component['form'].patchValue({ userId: '  new@example.com  ', userName: '  New User  ' });
    component['save']();

    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.userId).toBe('new@example.com');
    expect(arg.userName).toBe('New User');
  });
});

describe('AppUserForm — edit mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the user, patches the form and keeps userId disabled', () => {
    const { component, service } = setup('miles@uuu.com.tw');
    expect(component['isEdit']()).toBeTrue();
    expect(service.getById).toHaveBeenCalledWith('miles@uuu.com.tw');
    expect(component['form'].getRawValue().userName).toBe('Miles Sun');
    // UserId is the immutable clustered PK.
    expect(component['form'].controls.userId.disabled).toBeTrue();
  });

  it('patches the N-N role selection', () => {
    const { component } = setup('miles@uuu.com.tw');
    expect(component['form'].getRawValue().roleIds).toEqual(['Admin', 'User']);
  });

  it('renders no password input in edit mode either', () => {
    const { fixture } = setup('miles@uuu.com.tw');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('input[type="password"]'),
    ).toBeNull();
  });

  it('updates without any password field in the payload', () => {
    const { component, service, router } = setup('miles@uuu.com.tw');
    component['form'].patchValue({ userName: 'Miles Sun (更新)', isActive: false });
    component['save']();

    expect(service.update).toHaveBeenCalled();
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(8);
    expect(arg.userId).toBe('miles@uuu.com.tw'); // from getRawValue(), despite being disabled
    expect(arg.userName).toBe('Miles Sun (更新)');
    expect(arg.isActive).toBeFalse();
    expect(Object.keys(arg)).not.toContain('passwordHash');
    expect(router.navigate).toHaveBeenCalledWith(['/app-users', 'miles@uuu.com.tw']);
  });

  // --- 重設密碼為預設值 Reset Password to Default -------------------------
  describe('reset password to default', () => {
    it('shows the button for an Admin', () => {
      const { fixture } = setup('miles@uuu.com.tw', ['Admin', 'developer', 'User']);

      expect(resetButton(fixture)).not.toBeNull();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('重設密碼為預設值');
    });

    it('hides the button for a non-Admin', () => {
      const { fixture } = setup('miles@uuu.com.tw', ['User', 'developer']);

      expect(resetButton(fixture)).toBeNull();
    });

    it('hides the button for a user with no roles', () => {
      const { fixture } = setup('miles@uuu.com.tw', []);

      expect(resetButton(fixture)).toBeNull();
    });

    it('is case-sensitive: "admin" does not unlock it', () => {
      // Agrees with the API, where [Authorize(Roles = "Admin")] compares ordinally — otherwise the
      // button would appear and the call would 403.
      const { fixture } = setup('miles@uuu.com.tw', ['admin']);

      expect(resetButton(fixture)).toBeNull();
    });

    it('hides the button on the add form, even for an Admin', () => {
      // There is no account to reset yet, and create already applies the default password.
      const { fixture } = setup(null, ['Admin']);

      expect(resetButton(fixture)).toBeNull();
    });

    it('does nothing until the confirmation is accepted', () => {
      const { fixture, service } = setup('miles@uuu.com.tw', ['Admin']);
      const confirmation = confirmationOf(fixture);
      spyOn(confirmation, 'confirm').and.returnValue(confirmation); // user has not answered yet

      (fixture.componentInstance as unknown as { resetPassword: () => void }).resetPassword();

      expect(service.resetPasswordToDefault).not.toHaveBeenCalled();
    });

    it('sends only the UserId once confirmed', () => {
      const { fixture, service } = setup('miles@uuu.com.tw', ['Admin']);

      acceptConfirm(fixture);

      // 🔐 No password and no hash leaves the client — just who to reset.
      expect(service.resetPasswordToDefault).toHaveBeenCalledOnceWith('miles@uuu.com.tw');
    });

    it('clears 密碼更新時間 on success, matching the NULL the API writes', () => {
      const { fixture, component } = setup('miles@uuu.com.tw', ['Admin']);
      expect(component['passwordUpdatedTime']()).toBe('2026-06-04T12:49:14.023');

      acceptConfirm(fixture);
      fixture.detectChanges();

      // The reset writes PasswordUpdatedTime = NULL ("still on the default password"), so the form
      // must stop showing a timestamp the DB no longer holds.
      expect(component['passwordUpdatedTime']()).toBeNull();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('未變更（仍為系統預設密碼）');
    });

    it('does not save the rest of the form', () => {
      // Resetting a password is not "save the user" — the two are independent.
      const { fixture, service } = setup('miles@uuu.com.tw', ['Admin']);

      acceptConfirm(fixture);

      expect(service.update).not.toHaveBeenCalled();
    });

    it('reports a 403 without clearing the timestamp', () => {
      const { fixture, component, service } = setup('miles@uuu.com.tw', ['Admin']);
      service.resetPasswordToDefault.and.returnValue(
        throwError(() => ({ status: 403 })),
      );

      acceptConfirm(fixture);

      // Nothing changed server-side, so the form must not pretend it did.
      expect(component['passwordUpdatedTime']()).toBe('2026-06-04T12:49:14.023');
      expect(component['resetting']()).toBeFalse();
    });

    it('clears the loading flag after a failure so the Admin can retry', () => {
      const { fixture, component, service } = setup('miles@uuu.com.tw', ['Admin']);
      service.resetPasswordToDefault.and.returnValue(throwError(() => ({ status: 500 })));

      acceptConfirm(fixture);

      expect(component['resetting']()).toBeFalse();
    });
  });
});
