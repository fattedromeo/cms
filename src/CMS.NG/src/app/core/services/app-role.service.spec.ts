import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { AppRoleService } from './app-role.service';
import { AppRole, AppRoleRequest } from '@core/models/app-role.model';

describe('AppRoleService', () => {
  let service: AppRoleService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/app-roles`;

  const sample: AppRole = {
    pkid: 1,
    roleId: 'Admin',
    roleName: 'Administrator',
    permissionLevel: 1,
    description: '系統管理員',
    userCount: 3,
    userIds: ['helen', 'miles@uuu.com.tw'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AppRoleService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AppRoleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll issues GET and returns roles', () => {
    let result: AppRole[] | undefined;
    service.getAll().subscribe((r) => (result = r));

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);

    expect(result).toEqual([sample]);
  });

  it('query POSTs the filter body', () => {
    service.query({ keyword: 'adm', permissionLevel: 1 }).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'adm', permissionLevel: 1 });
    req.flush([sample]);
  });

  it('getById encodes the string key in the URL', () => {
    service.getById('a/b role').subscribe();

    const req = httpMock.expectOne(`${base}/${encodeURIComponent('a/b role')}`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create POSTs the request', () => {
    const request: AppRoleRequest = {
      pkid: 0,
      roleId: 'Editor',
      roleName: 'Editor',
      permissionLevel: 50,
      description: null,
      userIds: ['helen'],
    };
    service.create(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ ...sample, ...request });
  });

  it('update PUTs the request', () => {
    const request: AppRoleRequest = {
      pkid: 1,
      roleId: 'Admin',
      roleName: 'Administrator',
      permissionLevel: 1,
      description: '系統管理員',
      userIds: [],
    };
    service.update(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('delete DELETEs by encoded id', () => {
    service.delete('Admin').subscribe();

    const req = httpMock.expectOne(`${base}/Admin`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getUserOptions GETs the lookup', () => {
    service.getUserOptions().subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/lookups/app-users`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: 'helen', label: 'helen (helen)' }]);
  });
});
