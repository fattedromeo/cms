import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { AppRoleForm } from './app-role-form';
import { AppRoleService } from '@core/services/app-role.service';
import { AppRole } from '@core/models/app-role.model';

const sample: AppRole = {
  pkid: 1,
  roleId: 'Admin',
  roleName: 'Administrator',
  permissionLevel: 1,
  description: '系統管理員',
  userCount: 2,
  userIds: ['helen'],
};

function setup(id: string | null) {
  const service = jasmine.createSpyObj<AppRoleService>('AppRoleService', [
    'getById',
    'getUserOptions',
    'create',
    'update',
  ]);
  service.getUserOptions.and.returnValue(of([{ pkid: 'helen', label: 'helen (helen)' }]));
  service.getById.and.returnValue(of(sample));
  service.create.and.returnValue(of(sample));
  service.update.and.returnValue(of(void 0));
  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

  TestBed.configureTestingModule({
    imports: [AppRoleForm],
    providers: [
      provideNoopAnimations(),
      // The 異動紀錄 badge's RowAuditService rides the real HttpClient; the testing backend
      // satisfies the injection and leaves its GET pending (harmless here).
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AppRoleService, useValue: service },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<AppRoleForm> = TestBed.createComponent(AppRoleForm);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, service, router };
}

describe('AppRoleForm — add mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('is in add mode with permissionLevel defaulted to 100', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['form'].getRawValue().permissionLevel).toBe(100);
    expect(component['form'].controls.roleId.disabled).toBeFalse();
  });

  it('does not call the service when the form is invalid', () => {
    const { component, service } = setup(null);
    component['form'].patchValue({ roleId: '', roleName: '' });
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates and navigates to the detail page on valid save', () => {
    const { component, service, router } = setup(null);
    component['form'].patchValue({ roleId: 'Editor', roleName: 'Editor', permissionLevel: 50 });
    component['save']();

    expect(service.create).toHaveBeenCalled();
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.roleId).toBe('Editor');
    expect(arg.description).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/app-roles', 'Editor']);
  });

  it('surfaces a 409 conflict without navigating', () => {
    const { component, service, router } = setup(null);
    service.create.and.returnValue(throwError(() => ({ status: 409 })));
    component['form'].patchValue({ roleId: 'Admin', roleName: 'Administrator', permissionLevel: 1 });
    component['save']();

    expect(service.create).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('AppRoleForm — edit mode', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the role, patches the form and disables roleId', () => {
    const { component, service } = setup('Admin');
    expect(component['isEdit']()).toBeTrue();
    expect(service.getById).toHaveBeenCalledWith('Admin');
    expect(component['form'].getRawValue().roleName).toBe('Administrator');
    expect(component['form'].controls.roleId.disabled).toBeTrue();
  });

  it('updates and navigates on save', () => {
    const { component, service, router } = setup('Admin');
    component['form'].patchValue({ roleName: 'Administrator (renamed)' });
    component['save']();

    expect(service.update).toHaveBeenCalled();
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.roleId).toBe('Admin');
    expect(arg.roleName).toBe('Administrator (renamed)');
    expect(router.navigate).toHaveBeenCalledWith(['/app-roles', 'Admin']);
  });
});
