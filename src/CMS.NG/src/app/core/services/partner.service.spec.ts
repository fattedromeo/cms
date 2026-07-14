import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { PartnerService } from './partner.service';
import { Partner, PartnerRequest } from '@core/models/partner.model';

describe('PartnerService', () => {
  let service: PartnerService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/partners`;
  const lookups = `${environment.apiUrl}/lookups`;

  const sample: Partner = {
    pkid: 1,
    name: '微軟',
    appKey: 'MS',
    nameOnPartnerMenu: '微軟認證課程',
    nameOnCourseDetailPage: '微軟',
    displayOrder: 10,
    imageFilename: 'ms.png',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PartnerService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PartnerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll issues GET and returns partners', () => {
    let result: Partner[] | undefined;
    service.getAll().subscribe((r) => (result = r));

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);

    expect(result).toEqual([sample]);
  });

  it('query POSTs the filter body', () => {
    service.query({ keyword: '微軟' }).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: '微軟' });
    req.flush([sample]);
  });

  it('getById GETs by numeric pkid', () => {
    service.getById(1).subscribe();

    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create POSTs the request', () => {
    const request: PartnerRequest = { ...sample, pkid: 0 };
    service.create(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(sample);
  });

  it('update PUTs the request', () => {
    const request: PartnerRequest = { ...sample };
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

  it('getPartnerOptions GETs the partners lookup', () => {
    service.getPartnerOptions().subscribe();

    const req = httpMock.expectOne(`${lookups}/partners`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: '1', label: '微軟' }]);
  });
});
