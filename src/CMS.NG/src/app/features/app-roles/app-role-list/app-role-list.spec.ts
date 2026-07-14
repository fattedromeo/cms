import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AppRoleList } from './app-role-list';
import { AppRoleService } from '@core/services/app-role.service';
import { AppRole } from '@core/models/app-role.model';

const sample: AppRole = {
  pkid: 1,
  roleId: 'Admin',
  roleName: 'Administrator',
  permissionLevel: 1,
  description: '系統管理員',
  userCount: 3,
  userIds: ['helen'],
};

describe('AppRoleList', () => {
  let fixture: ComponentFixture<AppRoleList>;
  let component: AppRoleList;
  let service: jasmine.SpyObj<AppRoleService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<AppRoleService>('AppRoleService', ['query', 'delete']);
    service.query.and.returnValue(of([sample]));
    service.delete.and.returnValue(of(void 0));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [AppRoleList],
      providers: [
        provideNoopAnimations(),
        { provide: AppRoleService, useValue: service },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppRoleList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads roles on init via query', () => {
    expect(service.query).toHaveBeenCalled();
    expect(component['roles']()).toEqual([sample]);
  });

  it('add() navigates to the new form', () => {
    component['add']();
    expect(router.navigate).toHaveBeenCalledWith(['/app-roles/new']);
  });

  it('view() navigates to the detail route by roleId', () => {
    component['view'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/app-roles', 'Admin']);
  });

  it('edit() navigates to the edit route', () => {
    component['edit'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/app-roles', 'Admin', 'edit']);
  });

  it('applyFilters persists filters and re-queries', () => {
    service.query.calls.reset();
    component['filterDraft'] = { keyword: 'adm', permissionLevel: 1 };
    component['applyFilters']();

    expect(JSON.parse(sessionStorage.getItem('app-role-list-filters')!)).toEqual({
      keyword: 'adm',
      permissionLevel: 1,
    });
    expect(service.query).toHaveBeenCalledWith({ keyword: 'adm', permissionLevel: 1 });
  });

  it('clearFilters resets and removes persisted filters', () => {
    sessionStorage.setItem('app-role-list-filters', JSON.stringify({ keyword: 'x' }));
    component['clearFilters']();
    expect(sessionStorage.getItem('app-role-list-filters')).toBeNull();
    expect(component['appliedFilters']).toEqual({ keyword: null, permissionLevel: null });
  });

  it('onPage persists the page state', () => {
    component['onPage']({ first: 20, rows: 20 });
    expect(JSON.parse(sessionStorage.getItem('app-role-list-page')!)).toEqual({
      first: 20,
      rows: 20,
    });
  });
});
