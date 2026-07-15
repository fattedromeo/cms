import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { CourseService } from './course.service';
import { Course, CourseRequest } from '@core/models/course.model';

describe('CourseService', () => {
  let service: CourseService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/courses`;
  const lookups = `${environment.apiUrl}/lookups`;

  const sample: Course = {
    pkid: 1,
    title: 'Oracle資料庫之PL／SQL基礎',
    officialTitle: null,
    courseId: 'PLF',
    prodCourseId: 'PLF',
    friendlyUrl: 'oracle-plsql',
    displayOrder: 10,
    partnerPkid: 2,
    courseGroupPkid: 18,
    publishStatusPkid: 3,
    scheduleOn: '2015-11-10',
    scheduleOff: '2021-11-01',
    hour: 21,
    listPrice: 24000,
    learningCredit: 6,
    material: null,
    objective: null,
    target: null,
    prerequisites: null,
    outline: null,
    towardCertOrExam: null,
    note: null,
    otherInfo: null,
    canRepeat: true,
    partner: { pkid: 2, name: 'Oracle' },
    courseGroup: { pkid: 18, description: 'Oracle SQL/DB系列課程' },
    publishStatus: { pkid: 3, description: '已下架' },
    certificationPkids: [5],
    jobCategoryPkids: [22],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CourseService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll issues GET and returns courses', () => {
    let result: Course[] | undefined;
    service.getAll().subscribe((r) => (result = r));

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);

    expect(result).toEqual([sample]);
  });

  it('query POSTs the filter body', () => {
    service.query({ keyword: 'Oracle', partnerPkid: 2 }).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'Oracle', partnerPkid: 2 });
    req.flush([sample]);
  });

  it('query passes date-range bounds through as yyyy-MM-dd strings', () => {
    service.query({ scheduleOnFrom: '2020-01-01', scheduleOnTo: '2020-12-31' }).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.body).toEqual({ scheduleOnFrom: '2020-01-01', scheduleOnTo: '2020-12-31' });
    req.flush([]);
  });

  it('getById GETs by numeric pkid', () => {
    service.getById(1).subscribe();

    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create POSTs the request', () => {
    const request: CourseRequest = { ...sample, pkid: 0 } as unknown as CourseRequest;
    service.create(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(sample);
  });

  it('update PUTs the request', () => {
    const request = { ...sample } as unknown as CourseRequest;
    service.update(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    req.flush(null);
  });

  it('delete DELETEs by pkid', () => {
    service.delete(1).subscribe();

    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getPartnerOptions GETs the partners lookup', () => {
    service.getPartnerOptions().subscribe();
    const req = httpMock.expectOne(`${lookups}/partners`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: '1', label: 'Microsoft微軟' }]);
  });

  it('getCourseGroupOptions GETs the course-groups lookup', () => {
    service.getCourseGroupOptions().subscribe();
    const req = httpMock.expectOne(`${lookups}/course-groups`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: '18', label: 'Oracle SQL/DB系列課程' }]);
  });

  it('getPublishStatusOptions GETs the publish-statuses lookup', () => {
    service.getPublishStatusOptions().subscribe();
    const req = httpMock.expectOne(`${lookups}/publish-statuses`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: '3', label: '已下架' }]);
  });

  it('getCertificationOptions GETs the certifications lookup', () => {
    service.getCertificationOptions().subscribe();
    const req = httpMock.expectOne(`${lookups}/certifications`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: '5', label: 'Oracle - OCP' }]);
  });

  it('getJobCategoryOptions GETs the job-categories lookup', () => {
    service.getJobCategoryOptions().subscribe();
    const req = httpMock.expectOne(`${lookups}/job-categories`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: '22', label: '資料庫管理' }]);
  });
});
