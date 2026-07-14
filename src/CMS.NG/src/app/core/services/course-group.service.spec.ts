import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { CourseGroupService } from './course-group.service';
import { CourseGroup, CourseGroupRequest } from '@core/models/course-group.model';

describe('CourseGroupService', () => {
  let service: CourseGroupService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/course-groups`;
  const lookups = `${environment.apiUrl}/lookups`;

  const sample: CourseGroup = {
    pkid: 1,
    description: '資訊安全',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CourseGroupService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseGroupService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll issues GET and returns course groups', () => {
    let result: CourseGroup[] | undefined;
    service.getAll().subscribe((r) => (result = r));

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);

    expect(result).toEqual([sample]);
  });

  it('query POSTs the filter body', () => {
    service.query({ keyword: '資訊' }).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: '資訊' });
    req.flush([sample]);
  });

  it('getById GETs by numeric pkid', () => {
    service.getById(1).subscribe();

    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create POSTs the request', () => {
    const request: CourseGroupRequest = { ...sample, pkid: 0 };
    service.create(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(sample);
  });

  it('update PUTs the request', () => {
    const request: CourseGroupRequest = { ...sample };
    service.update(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('delete DELETEs by pkid', () => {
    service.delete(1).subscribe();

    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getCourseGroupOptions GETs the course-groups lookup', () => {
    service.getCourseGroupOptions().subscribe();

    const req = httpMock.expectOne(`${lookups}/course-groups`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: '1', label: '資訊安全' }]);
  });
});
