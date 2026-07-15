/** Slim Promotion2 projection resolved by the API — carries the PromoCode the grid renders. */
export interface FeaturedPromoPromotionRef {
  pkid: number;
  promoCode: string;
}

/**
 * One promo pinned to a (scheduleOn, trainingCenter, slot) cell of the week grid.
 *
 * `scheduleOn` is a C# `DateOnly` → a plain `yyyy-MM-dd` string with no timezone. Parse it with
 * `fromIso` from `@core/utils/date.util`, never `new Date(s)`, and never append `'Z'` (that trick
 * is for `datetime` columns only).
 */
export interface FeaturedPromoItem {
  pkid: number;
  scheduleOn: string;
  trainingCenterPkid: number;
  /** 1, 2 or 3. */
  slot: number;
  promotionPkid: number;
  topic: string;
  description: string;
  /** Resolved via INNER JOIN — present on every row the API returns. */
  promotion: FeaturedPromoPromotionRef | null;
}

/**
 * Write DTO.
 *
 * `slot` is sent on create (it decides which cell to fill) but is IGNORED by the API on update —
 * slot changes go exclusively through `move()`, which is the only path that handles the
 * unique-index swap.
 */
export interface FeaturedPromoItemRequest {
  /** 0 on create. */
  pkid: number;
  scheduleOn: string;
  trainingCenterPkid: number;
  slot: number;
  promotionPkid: number;
  topic: string;
  description: string;
}

/** Search DTO. The grid sends the active tab plus the Monday/Sunday bounds it computed. */
export interface FeaturedPromoItemQuery {
  trainingCenterPkid?: number;
  /** Inclusive lower bound, `yyyy-MM-dd`. */
  scheduleOnFrom?: string;
  /** Inclusive upper bound, `yyyy-MM-dd`. */
  scheduleOnTo?: string;
  keyword?: string;
  promotionPkid?: number;
}

/** `'down'` = the 「+」 button (slot 1 → 2); `'up'` = the 「--」 button (slot 2 → 1). */
export type FeaturedPromoItemMoveDirection = 'up' | 'down';

export interface FeaturedPromoItemMoveRequest {
  pkid: number;
  direction: FeaturedPromoItemMoveDirection;
}

/** What the Copy button stashes and Paste replays — the payload fields only, never the cell. */
export interface FeaturedPromoItemClipboard {
  promotionPkid: number;
  promoCode: string;
  topic: string;
  description: string;
}
