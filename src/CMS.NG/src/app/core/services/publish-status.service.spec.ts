import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { PublishStatusService } from './publish-status.service';
import { PublishStatus, PublishStatusRequest } from '@core/models/publish-status.model';

describe('PublishStatusService', () => {
  let service: PublishStatusService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/publish-statuses`;

  const sample: PublishStatus = {
    pkid: 2,
    description: '已發布',
    isDraft: false,
    isPublished: true,
    isDiscontinued: false,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PublishStatusService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PublishStatusService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll issues GET and returns statuses', () => {
    let result: PublishStatus[] | undefined;
    service.getAll().subscribe((r) => (result = r));

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);

    expect(result).toEqual([sample]);
  });

  it('query POSTs the filter body', () => {
    service.query({ keyword: '發布', isPublished: true }).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: '發布', isPublished: true });
    req.flush([sample]);
  });

  it('getById GETs by numeric pkid', () => {
    service.getById(2).subscribe();

    const req = httpMock.expectOne(`${base}/2`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create POSTs the request', () => {
    const request: PublishStatusRequest = {
      pkid: 3,
      description: '已停用',
      isDraft: false,
      isPublished: false,
      isDiscontinued: true,
    };
    service.create(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ ...sample, ...request });
  });

  it('update PUTs the request', () => {
    const request: PublishStatusRequest = {
      pkid: 2,
      description: '已發布',
      isDraft: false,
      isPublished: true,
      isDiscontinued: false,
    };
    service.update(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('delete DELETEs by pkid', () => {
    service.delete(2).subscribe();

    const req = httpMock.expectOne(`${base}/2`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
