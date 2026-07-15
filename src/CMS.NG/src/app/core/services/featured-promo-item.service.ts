import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import {
  FeaturedPromoItem,
  FeaturedPromoItemMoveDirection,
  FeaturedPromoItemQuery,
  FeaturedPromoItemRequest,
} from '@core/models/featured-promo-item.model';
import { LookupItem } from '@core/models/lookup-item.model';
import { addDays, toIso } from '@core/utils/date.util';

@Injectable({ providedIn: 'root' })
export class FeaturedPromoItemService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/featured-promo-items`;
  private readonly lookupUrl = `${environment.apiUrl}/lookups`;

  /**
   * Every row — 31,715 of them in the dev DB. Present for parity with the other services; the grid
   * must use `queryWeek` instead.
   */
  getAll(): Observable<FeaturedPromoItem[]> {
    return this.http.get<FeaturedPromoItem[]>(this.baseUrl);
  }

  query(query: FeaturedPromoItemQuery): Observable<FeaturedPromoItem[]> {
    return this.http.post<FeaturedPromoItem[]>(`${this.baseUrl}/query`, query);
  }

  /**
   * The grid's only read: one training center, one Monday-to-Sunday week.
   *
   * `weekStart` must already be a Monday (`startOfWeek`). Both bounds are inclusive, so Sunday is
   * Monday + 6 — not + 7, which would pull in the next Monday's rows.
   */
  queryWeek(trainingCenterPkid: number, weekStart: Date): Observable<FeaturedPromoItem[]> {
    return this.query({
      trainingCenterPkid,
      scheduleOnFrom: toIso(weekStart),
      scheduleOnTo: toIso(addDays(weekStart, 6)),
    });
  }

  // pkid is numeric — no encodeURIComponent needed (unlike the string-PK AppRole service).
  getById(pkid: number): Observable<FeaturedPromoItem> {
    return this.http.get<FeaturedPromoItem>(`${this.baseUrl}/${pkid}`);
  }

  create(request: FeaturedPromoItemRequest): Observable<FeaturedPromoItem> {
    return this.http.post<FeaturedPromoItem>(this.baseUrl, request);
  }

  update(request: FeaturedPromoItemRequest): Observable<void> {
    return this.http.put<void>(this.baseUrl, request);
  }

  delete(pkid: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${pkid}`);
  }

  /**
   * Move an item one slot within its day — the 「+」 (`'down'`) and 「--」 (`'up'`) buttons.
   *
   * This is the ONLY way to change a slot. `update()` deliberately does not touch it: the API
   * needs to swap with the target slot's occupant inside one statement to satisfy
   * `IX_FeaturedPromoItem_UniqueDateLocSlot`.
   */
  move(pkid: number, direction: FeaturedPromoItemMoveDirection): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/move`, { pkid, direction });
  }

  // --- Lookups used by the week grid ---------------------------------------

  /** 訓練中心 tab options (label = TrainingCenter.Name, ordered by DisplayOrder). */
  getTrainingCenterOptions(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(`${this.lookupUrl}/training-centers`);
  }

  /** 活動代碼 options for the PromoCode type-ahead (label = Promotion2.PromoCode). */
  getPromotionOptions(): Observable<LookupItem[]> {
    return this.http.get<LookupItem[]>(`${this.lookupUrl}/promotions`);
  }
}
