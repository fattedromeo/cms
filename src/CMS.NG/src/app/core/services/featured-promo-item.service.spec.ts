import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { FeaturedPromoItemService } from './featured-promo-item.service';
import {
  FeaturedPromoItem,
  FeaturedPromoItemRequest,
} from '@core/models/featured-promo-item.model';

describe('FeaturedPromoItemService', () => {
  let service: FeaturedPromoItemService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/featured-promo-items`;
  const lookups = `${environment.apiUrl}/lookups`;

  // Shaped after a real dev-DB row (台北 / 2026-03-16 / slot 1).
  const sample: FeaturedPromoItem = {
    pkid: 76884,
    scheduleOn: '2026-03-16',
    trainingCenterPkid: 1,
    slot: 1,
    promotionPkid: 1081,
    topic: '快速上手Power Platform',
    description: '參加Power Platform認證系列課程，每科贈送1張微軟考試券',
    promotion: { pkid: 1081, promoCode: '220624_PowerPlatform' },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FeaturedPromoItemService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FeaturedPromoItemService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll issues GET and returns items', () => {
    let result: FeaturedPromoItem[] | undefined;
    service.getAll().subscribe((r) => (result = r));

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);

    expect(result).toEqual([sample]);
  });

  it('query POSTs the filter body', () => {
    service.query({ trainingCenterPkid: 1, keyword: 'Python' }).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ trainingCenterPkid: 1, keyword: 'Python' });
    req.flush([sample]);
  });

  // --- The one-week ScheduleOn filter --------------------------------------

  it('queryWeek posts Monday..Sunday as inclusive yyyy-MM-dd bounds', () => {
    // 2026-03-16 is the Monday of the mockup's week.
    service.queryWeek(1, new Date(2026, 2, 16)).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      trainingCenterPkid: 1,
      scheduleOnFrom: '2026-03-16',
      scheduleOnTo: '2026-03-22', // Monday + 6, NOT + 7
    });
    req.flush([sample]);
  });

  it('queryWeek spans exactly 7 inclusive days', () => {
    service.queryWeek(1, new Date(2026, 2, 16)).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    const { scheduleOnFrom, scheduleOnTo } = req.request.body;
    const days =
      (Date.parse(scheduleOnTo) - Date.parse(scheduleOnFrom)) / 86_400_000;
    expect(days).toBe(6); // 6 days apart = 7 days inclusive
    req.flush([]);
  });

  it('queryWeek serializes with LOCAL date components (no UTC day shift)', () => {
    // In UTC+8 a toISOString()-based implementation would send 2026-02-28 for this Monday.
    service.queryWeek(1, new Date(2026, 2, 2)).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.body.scheduleOnFrom).toBe('2026-03-02');
    expect(req.request.body.scheduleOnTo).toBe('2026-03-08');
    req.flush([]);
  });

  it('queryWeek crosses a month boundary correctly', () => {
    service.queryWeek(1, new Date(2026, 2, 30)).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.body).toEqual({
      trainingCenterPkid: 1,
      scheduleOnFrom: '2026-03-30',
      scheduleOnTo: '2026-04-05',
    });
    req.flush([]);
  });

  // --- The TrainingCenter filter -------------------------------------------

  it('queryWeek sends the training-center pkid it was given', () => {
    service.queryWeek(3, new Date(2026, 2, 16)).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.body.trainingCenterPkid).toBe(3);
    req.flush([]);
  });

  it('queryWeek handles a non-contiguous training-center pkid', () => {
    // 線上研討會 is pkid 54 sitting at tab index 4 — the tab must send the pkid, not the index.
    service.queryWeek(54, new Date(2026, 2, 16)).subscribe();

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.body.trainingCenterPkid).toBe(54);
    req.flush([]); // 54 legitimately has no rows
  });

  it('getById GETs by numeric pkid', () => {
    service.getById(76884).subscribe();

    const req = httpMock.expectOne(`${base}/76884`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create POSTs the request', () => {
    const request: FeaturedPromoItemRequest = {
      pkid: 0,
      scheduleOn: '2026-03-16',
      trainingCenterPkid: 1,
      slot: 2,
      promotionPkid: 1081,
      topic: '主題',
      description: '說明',
    };
    service.create(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(sample);
  });

  it('update PUTs the request', () => {
    const request: FeaturedPromoItemRequest = {
      pkid: 76884,
      scheduleOn: '2026-03-16',
      trainingCenterPkid: 1,
      slot: 1,
      promotionPkid: 1081,
      topic: '改過的主題',
      description: '說明',
    };
    service.update(request).subscribe();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('delete DELETEs by pkid', () => {
    service.delete(76884).subscribe();

    const req = httpMock.expectOne(`${base}/76884`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- Move (the 「+」/「--」 buttons) --------------------------------------

  it("move POSTs 'down' for the 「+」 button", () => {
    service.move(76884, 'down').subscribe();

    const req = httpMock.expectOne(`${base}/move`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ pkid: 76884, direction: 'down' });
    req.flush(null);
  });

  it("move POSTs 'up' for the 「--」 button", () => {
    service.move(76884, 'up').subscribe();

    const req = httpMock.expectOne(`${base}/move`);
    expect(req.request.body).toEqual({ pkid: 76884, direction: 'up' });
    req.flush(null);
  });

  it('move surfaces a 400 at the slot boundary', () => {
    let status: number | undefined;
    service.move(76884, 'up').subscribe({ error: (e) => (status = e.status) });

    httpMock
      .expectOne(`${base}/move`)
      .flush({ message: '已經在第一個或最後一個位置，無法再移動。' }, { status: 400, statusText: 'Bad Request' });

    expect(status).toBe(400);
  });

  // --- Lookups --------------------------------------------------------------

  it('getTrainingCenterOptions GETs the training-centers lookup', () => {
    let result: { pkid: string; label: string }[] | undefined;
    service.getTrainingCenterOptions().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${lookups}/training-centers`);
    expect(req.request.method).toBe('GET');
    req.flush([
      { pkid: '1', label: '台北' },
      { pkid: '54', label: '線上研討會' },
    ]);

    // pkid arrives as a STRING — callers must Number()-map before binding to the numeric tab value.
    expect(result![0].pkid).toBe('1');
    expect(typeof result![0].pkid).toBe('string');
  });

  it('getPromotionOptions GETs the promotions lookup with PromoCode labels', () => {
    let result: { pkid: string; label: string }[] | undefined;
    service.getPromotionOptions().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${lookups}/promotions`);
    expect(req.request.method).toBe('GET');
    req.flush([{ pkid: '1081', label: '220624_PowerPlatform' }]);

    expect(result![0].label).toBe('220624_PowerPlatform');
    expect(result![0].pkid).toBe('1081');
  });
});
