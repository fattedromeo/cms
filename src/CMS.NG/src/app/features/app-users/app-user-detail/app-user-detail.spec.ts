import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { AppUserDetail } from './app-user-detail';
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

function setup(user: AppUser | null = sample, fail = false) {
  const service = jasmine.createSpyObj<AppUserService>('AppUserService', [
    'getById',
    'getRoleOptions',
  ]);
  service.getById.and.returnValue(fail ? throwError(() => new Error('404')) : of(user!));
  service.getRoleOptions.and.returnValue(
    of([
      { pkid: 'Admin', label: 'Administrator' },
      { pkid: 'User', label: 'User' },
    ]),
  );
  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

  TestBed.configureTestingModule({
    imports: [AppUserDetail],
    providers: [
      provideNoopAnimations(),
      // The 異動紀錄 badge's RowAuditService rides the real HttpClient; the testing backend
      // satisfies the injection and leaves its GET pending (harmless here).
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AppUserService, useValue: service },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'miles@uuu.com.tw' }) } },
      },
    ],
  });

  const fixture: ComponentFixture<AppUserDetail> = TestBed.createComponent(AppUserDetail);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, router };
}

describe('AppUserDetail', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the user by the string userId', () => {
    const { component, service } = setup();
    expect(service.getById).toHaveBeenCalledWith('miles@uuu.com.tw');
    expect(component['user']()).toEqual(sample);
  });

  it('resolves roleIds to role labels', () => {
    const { component } = setup();
    expect(component['roleLabels']()).toEqual(['Administrator', 'User']);
  });

  it('renders the user and never renders a password', () => {
    const { fixture } = setup();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('miles@uuu.com.tw');
    expect(text).toContain('Miles Sun');
    expect(text.toLowerCase()).not.toContain('passwordhash');
  });

  it('shows the default-password notice when passwordUpdatedTime is null', () => {
    const { fixture } = setup({ ...sample, passwordUpdatedTime: null });
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('未變更（仍為系統預設密碼）');
  });

  it('flags notFound when the user is missing', () => {
    const { component } = setup(null, true);
    expect(component['notFound']()).toBeTrue();
  });

  it('edit() navigates to the edit route', () => {
    const { component, router } = setup();
    component['edit']();
    expect(router.navigate).toHaveBeenCalledWith(['/app-users', 'miles@uuu.com.tw', 'edit']);
  });

  it('back() navigates to the list', () => {
    const { component, router } = setup();
    component['back']();
    expect(router.navigate).toHaveBeenCalledWith(['/app-users']);
  });
});
