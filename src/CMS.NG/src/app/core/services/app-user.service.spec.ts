import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { AppUserService } from './app-user.service';
import { AppUser, AppUserRequest } from '@core/models/app-user.model';

describe('AppUserService', () => {
  let service: AppUserService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/app-users`;
  const lookups = `${environment.apiUrl}/lookups`;

  const sample: AppUser = {
    pkid: 8,
    userId: 'miles@uuu.com.tw',
    userName: 'Miles Sun',
    isActive: true,
    passwordUpdatedTime: '2026-06-04T12:49:14.023',
    roleCount: 2,
    roleIds: ['Admin', 'User'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AppUserService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AppUserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll issues GET and returns users', () => {
    let result: AppUser[] | undefined;
    service.getAll().subscribe((r) => (result = r));

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);

    expect(result).toEqual([sample]);
  });

  it('query POSTs the filter body', () => {
    service.query({ keyword: 'miles', isActive: true, roleId: 'Admin' }).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'miles', isActive: true, roleId: 'Admin' });
    req.flush([sample]);
  });

  // UserId is an email — an unencoded '@' would break the route.
  it('getById encodeURIComponent-s the string UserId', () => {
    service.getById('miles@uuu.com.tw').subscribe();

    const req = httpMock.expectOne(`${base}/miles%40uuu.com.tw`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('delete encodeURIComponent-s the string UserId', () => {
    service.delete('miles@uuu.com.tw').subscribe();

    const req = httpMock.expectOne(`${base}/miles%40uuu.com.tw`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('create POSTs the request', () => {
    const request: AppUserRequest = {
      pkid: 0,
      userId: 'new@example.com',
      userName: 'New User',
      isActive: true,
      roleIds: ['User'],
    };
    service.create(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(sample);
  });

  it('update PUTs the request', () => {
    const request: AppUserRequest = {
      pkid: 8,
      userId: 'miles@uuu.com.tw',
      userName: 'Miles Sun',
      isActive: true,
      roleIds: ['Admin'],
    };
    service.update(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    req.flush(null);
  });

  // The password rule, asserted at the wire: no create/update body may carry a password field.
  it('never sends a passwordHash on create or update', () => {
    const request: AppUserRequest = {
      pkid: 0,
      userId: 'new@example.com',
      userName: 'New User',
      isActive: true,
      roleIds: [],
    };

    service.create(request).subscribe();
    const createReq = httpMock.expectOne(base);
    expect(Object.keys(createReq.request.body as object)).not.toContain('passwordHash');
    expect(Object.keys(createReq.request.body as object)).not.toContain('passwordUpdatedTime');
    createReq.flush(sample);

    service.update({ ...request, pkid: 8 }).subscribe();
    const updateReq = httpMock.expectOne(base);
    expect(Object.keys(updateReq.request.body as object)).not.toContain('passwordHash');
    updateReq.flush(null);
  });

  it('getRoleOptions GETs the app-roles lookup', () => {
    service.getRoleOptions().subscribe();

    const req = httpMock.expectOne(`${lookups}/app-roles`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: 'Admin', label: 'Administrator' }]);
  });
});
