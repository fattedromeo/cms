import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { AppRoleDetail } from './app-role-detail';
import { AppRoleService } from '@core/services/app-role.service';
import { AppRole } from '@core/models/app-role.model';

const sample: AppRole = {
  pkid: 1,
  roleId: 'Admin',
  roleName: 'Administrator',
  permissionLevel: 1,
  description: '系統管理員',
  userCount: 2,
  userIds: ['helen', 'miles@uuu.com.tw'],
};

describe('AppRoleDetail', () => {
  let fixture: ComponentFixture<AppRoleDetail>;
  let component: AppRoleDetail;
  let service: jasmine.SpyObj<AppRoleService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<AppRoleService>('AppRoleService', ['getById', 'getUserOptions']);
    service.getById.and.returnValue(of(sample));
    service.getUserOptions.and.returnValue(
      of([
        { pkid: 'helen', label: 'helen (helen)' },
        { pkid: 'miles@uuu.com.tw', label: 'Miles Sun (miles@uuu.com.tw)' },
      ]),
    );
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [AppRoleDetail],
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
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'Admin' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppRoleDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the role by id and maps user labels', () => {
    expect(service.getById).toHaveBeenCalledWith('Admin');
    expect(component['role']()).toEqual(sample);
    expect(component['userLabels']()).toEqual(['helen (helen)', 'Miles Sun (miles@uuu.com.tw)']);
  });

  it('renders the role name in the detail grid', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Administrator');
  });

  it('edit() navigates to the edit route', () => {
    component['edit']();
    expect(router.navigate).toHaveBeenCalledWith(['/app-roles', 'Admin', 'edit']);
  });

  it('back() navigates to the list', () => {
    component['back']();
    expect(router.navigate).toHaveBeenCalledWith(['/app-roles']);
  });
});
