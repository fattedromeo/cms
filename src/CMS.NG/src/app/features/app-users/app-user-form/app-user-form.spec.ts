import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AppUserForm } from './app-user-form';
import { AppUserService } from '@core/services/app-user.service';
import { AppUser } from '@core/models/app-user.model';

const sample: AppUser = {
  pkid: 8,
  userId: 'miles@uuu.com.tw',
  userName: 'Miles Sun',
  isActive: true,
  passwordUpdatedTime: '2026-06-04T12:49:14.023',
  roleCount: 2,
  roleIds: ['Admin', 'User'],
};

function setup(id: string | null) {
  const service = jasmine.createSpyObj<AppUserService>('AppUserService', [
    'getById',
    'create',
    'update',
    'getRoleOptions',
  ]);
  service.getById.and.returnValue(of(sample));
  service.create.and.returnValue(of(sample));
  service.update.and.returnValue(of(void 0));
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
});
