import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AppUserList } from './app-user-list';
import { AppUserService } from '@core/services/app-user.service';
import { AppUser } from '@core/models/app-user.model';

const sample: AppUser = {
  pkid: 8,
  userId: 'miles@uuu.com.tw',
  userName: 'Miles Sun',
  isActive: true,
  passwordUpdatedTime: '2026-06-04T12:49:14.023',
  roleCount: 2,
  roleIds: [],
};

describe('AppUserList', () => {
  let fixture: ComponentFixture<AppUserList>;
  let component: AppUserList;
  let service: jasmine.SpyObj<AppUserService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    sessionStorage.clear();
    service = jasmine.createSpyObj<AppUserService>('AppUserService', [
      'query',
      'delete',
      'getRoleOptions',
    ]);
    service.query.and.returnValue(of([sample]));
    service.delete.and.returnValue(of(void 0));
    service.getRoleOptions.and.returnValue(of([{ pkid: 'Admin', label: 'Administrator' }]));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [AppUserList],
      providers: [
        provideNoopAnimations(),
        { provide: AppUserService, useValue: service },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppUserList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads users on init via query', () => {
    expect(service.query).toHaveBeenCalled();
    expect(component['users']()).toEqual([sample]);
  });

  it('defaults to sorting by userId ascending', () => {
    expect(component['sortField']).toBe('userId');
    expect(component['sortOrder']).toBe(1);
  });

  it('loads the role options for the filter drawer', () => {
    expect(service.getRoleOptions).toHaveBeenCalled();
    // RoleId is a string — options bind straight through, no Number() mapping.
    expect(component['roleOptions']()).toEqual([{ pkid: 'Admin', label: 'Administrator' }]);
  });

  it('renders the user rows without any password value', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('miles@uuu.com.tw');
    expect(text).toContain('Miles Sun');
    expect(text.toLowerCase()).not.toContain('passwordhash');
  });

  it('add() navigates to the new form', () => {
    component['add']();
    expect(router.navigate).toHaveBeenCalledWith(['/app-users/new']);
  });

  it('view() navigates to the detail route by userId', () => {
    component['view'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/app-users', 'miles@uuu.com.tw']);
  });

  it('edit() navigates to the edit route', () => {
    component['edit'](sample);
    expect(router.navigate).toHaveBeenCalledWith(['/app-users', 'miles@uuu.com.tw', 'edit']);
  });

  it('applyFilters persists filters and re-queries', () => {
    service.query.calls.reset();
    component['filterDraft'] = { keyword: 'miles', isActive: true, roleId: 'Admin' };
    component['applyFilters']();

    expect(JSON.parse(sessionStorage.getItem('app-user-list-filters')!)).toEqual({
      keyword: 'miles',
      isActive: true,
      roleId: 'Admin',
    });
    expect(service.query).toHaveBeenCalledWith({
      keyword: 'miles',
      isActive: true,
      roleId: 'Admin',
    });
  });

  it('clearFilters resets and removes persisted filters', () => {
    sessionStorage.setItem('app-user-list-filters', JSON.stringify({ keyword: 'x' }));
    component['clearFilters']();
    expect(sessionStorage.getItem('app-user-list-filters')).toBeNull();
    expect(component['appliedFilters']).toEqual({ keyword: null, isActive: null, roleId: null });
  });

  it('onPage persists the page state', () => {
    component['onPage']({ first: 20, rows: 20 });
    expect(JSON.parse(sessionStorage.getItem('app-user-list-page')!)).toEqual({
      first: 20,
      rows: 20,
    });
  });

  it('delete confirmation warns that role assignments are removed too', () => {
    const confirm = component['confirm'] as unknown as {
      confirm: (o: { message: string }) => void;
    };
    let captured = '';
    spyOn(confirm, 'confirm').and.callFake((o: { message: string }) => (captured = o.message));

    component['remove'](sample);

    expect(captured).toContain('miles@uuu.com.tw');
    expect(captured).toContain('此使用者的角色指派將一併被刪除。');
  });
});
