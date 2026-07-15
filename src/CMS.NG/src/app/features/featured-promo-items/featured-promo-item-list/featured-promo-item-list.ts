import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, forkJoin } from 'rxjs';
import { TabsModule } from 'primeng/tabs';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { FeaturedPromoItemService } from '@core/services/featured-promo-item.service';
import {
  FeaturedPromoItem,
  FeaturedPromoItemClipboard,
  FeaturedPromoItemMoveDirection,
  FeaturedPromoItemRequest,
} from '@core/models/featured-promo-item.model';
import { LookupItem } from '@core/models/lookup-item.model';
import { addDays, fromIso, shortDate, startOfWeek, toIso, weekdayLabel } from '@core/utils/date.util';
import { FeaturedPromoItemForm } from '../featured-promo-item-form/featured-promo-item-form';

const FILTERS_KEY = 'featured-promo-item-list-filters';

/** The three slots every day renders, filled or not. */
const SLOTS = [1, 2, 3] as const;

interface SlotRow {
  slot: number;
  /** null = an empty cell → renders Edit/Paste instead of Edit/Copy/Delete. */
  item: FeaturedPromoItem | null;
}

interface DayColumn {
  iso: string;
  /** `3/16 (一)`. */
  label: string;
  rows: SlotRow[];
}

interface PersistedFilters {
  trainingCenterPkid: number | null;
  /** The Monday, as `yyyy-MM-dd`. */
  weekStart: string | null;
}

/**
 * 上稿作業 — the FeaturedPromoItem week grid.
 *
 * Deliberately not the standard list/detail/form triple: this is one page showing a
 * TrainingCenter tab × a Monday-to-Sunday week × 3 slots per day, with the Edit panel opening
 * inline. See `spec/custom/FeaturedPromoItem/FeaturedPromoItem.md`.
 */
@Component({
  selector: 'app-featured-promo-item-list',
  imports: [
    CommonModule,
    TabsModule,
    ButtonModule,
    ToastModule,
    TooltipModule,
    ConfirmDialogModule,
    FeaturedPromoItemForm,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './featured-promo-item-list.html',
  styleUrl: './featured-promo-item-list.scss',
})
export class FeaturedPromoItemList implements OnInit {
  private readonly service = inject(FeaturedPromoItemService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly trainingCenters = signal<LookupItem[]>([]);
  protected readonly promoOptions = signal<LookupItem[]>([]);
  protected readonly items = signal<FeaturedPromoItem[]>([]);
  protected readonly loading = signal(true);

  protected readonly activeTcPkid = signal<number | null>(null);
  protected readonly weekStart = signal<Date>(startOfWeek(new Date()));

  /** Survives week/tab navigation, so an editor can copy Monday's slot into Friday's. */
  protected readonly clipboard = signal<FeaturedPromoItemClipboard | null>(null);

  /** Which cell has the inline panel open, as `${iso}#${slot}`; null = none. */
  protected readonly editingCell = signal<string | null>(null);

  /** True when the open panel was opened by Paste (so it seeds from the clipboard). */
  protected readonly pasting = signal(false);

  /**
   * Tab options with a NUMERIC pkid. LookupItem.pkid is a string, and p-tabs compares its value by
   * identity — a string option against a numeric activeTcPkid would never match and every tab
   * would render inactive.
   */
  protected readonly tabOptions = computed(() =>
    this.trainingCenters().map((o) => ({ pkid: Number(o.pkid), label: o.label })),
  );

  /** `3/16 -- 3/22` for the week navigator. */
  protected readonly weekLabel = computed(() => {
    const start = this.weekStart();
    return `${shortDate(start)} -- ${shortDate(addDays(start, 6))}`;
  });

  /**
   * The grid: 7 days × 3 fixed slots, joined to whatever the API returned.
   *
   * Slots are NOT dense in the data — 15 (day, center) combos in the dev DB have fewer than three
   * rows, and at least one has a hole at slot 2 with slots 1 and 3 filled. So the grid is built
   * from the fixed slot list and rows are matched into it; iterating the API response instead
   * would silently collapse a hole and misalign the day.
   */
  protected readonly days = computed<DayColumn[]>(() => {
    const start = this.weekStart();
    const rows = this.items();

    return Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(start, offset);
      const iso = toIso(date);
      return {
        iso,
        label: `${shortDate(date)} (${weekdayLabel(date)})`,
        rows: SLOTS.map((slot) => ({
          slot,
          item: rows.find((r) => r.scheduleOn === iso && r.slot === slot) ?? null,
        })),
      };
    });
  });

  ngOnInit(): void {
    this.restoreFilters();

    forkJoin({
      centers: this.service.getTrainingCenterOptions(),
      promos: this.service.getPromotionOptions(),
    }).subscribe({
      next: ({ centers, promos }) => {
        this.trainingCenters.set(centers);
        this.promoOptions.set(promos);

        // Default to the first tab (台北, DisplayOrder 1). Tab pkids are not contiguous
        // (1, 2, 3, 5, 54), so never assume index === pkid.
        const restored = this.activeTcPkid();
        const stillExists = centers.some((c) => Number(c.pkid) === restored);
        if (!stillExists) {
          this.activeTcPkid.set(centers.length ? Number(centers[0].pkid) : null);
        }
        this.load();
      },
      error: () => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '載入失敗', detail: '無法取得選單資料。' });
      },
    });
  }

  protected load(): void {
    const tc = this.activeTcPkid();
    if (tc === null) {
      this.items.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.service.queryWeek(tc, this.weekStart()).subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: '載入失敗', detail: '無法取得上稿資料。' });
      },
    });
  }

  // --- Tab + week navigation ----------------------------------------------

  protected onTabChange(value: string | number | undefined): void {
    if (value === undefined || value === null) return;
    this.activeTcPkid.set(Number(value));
    this.closePanel();
    this.persistFilters();
    this.load();
  }

  protected prevWeek(): void {
    this.shiftWeek(-7);
  }

  protected nextWeek(): void {
    this.shiftWeek(7);
  }

  private shiftWeek(days: number): void {
    this.weekStart.set(addDays(this.weekStart(), days));
    this.closePanel();
    this.persistFilters();
    this.load();
  }

  // --- Inline panel --------------------------------------------------------

  protected cellKey(iso: string, slot: number): string {
    return `${iso}#${slot}`;
  }

  protected isEditing(iso: string, slot: number): boolean {
    return this.editingCell() === this.cellKey(iso, slot);
  }

  /** Edit an existing row, or open a blank New panel on an empty cell. */
  protected openPanel(iso: string, slot: number): void {
    this.pasting.set(false);
    this.editingCell.set(this.cellKey(iso, slot));
  }

  /** Open a New panel seeded from the clipboard. */
  protected paste(iso: string, slot: number): void {
    if (!this.clipboard()) return;
    this.pasting.set(true);
    this.editingCell.set(this.cellKey(iso, slot));
  }

  protected closePanel(): void {
    this.editingCell.set(null);
    this.pasting.set(false);
  }

  /** Stash a row's payload (never its cell) for a later Paste. */
  protected copy(item: FeaturedPromoItem): void {
    this.clipboard.set({
      promotionPkid: item.promotionPkid,
      promoCode: item.promotion?.promoCode ?? '',
      topic: item.topic,
      description: item.description,
    });
    this.messages.add({
      severity: 'info',
      summary: '已複製',
      detail: `已複製「${item.promotion?.promoCode ?? item.topic}」，可貼到空白欄位。`,
    });
  }

  protected onSaved(request: FeaturedPromoItemRequest): void {
    const isCreate = request.pkid === 0;
    // Widened to unknown: create() returns the new item and update() returns void, and the union
    // of the two Observables has no callable .subscribe overload (same fix as course-group-form).
    const op$: Observable<unknown> = isCreate
      ? this.service.create(request)
      : this.service.update(request);

    op$.subscribe({
      next: () => {
        this.closePanel();
        this.messages.add({
          severity: 'success',
          summary: isCreate ? '已新增' : '已更新',
          detail: `「${request.topic}」已儲存。`,
        });
        this.load();
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        // 409 carries the API's own Traditional-Chinese reason (duplicate cell, or a PromoCode
        // that no longer resolves) — prefer it over a generic message.
        const detail =
          err?.status === 409
            ? (err.error?.message ?? '此欄位已有資料，無法儲存。')
            : '儲存失敗，請稍後再試。';
        this.messages.add({ severity: 'error', summary: '儲存失敗', detail });
      },
    });
  }

  // --- Row actions ---------------------------------------------------------

  protected move(item: FeaturedPromoItem, direction: FeaturedPromoItemMoveDirection): void {
    this.service.move(item.pkid, direction).subscribe({
      next: () => {
        this.closePanel();
        this.load();
      },
      error: (err: { status?: number }) => {
        // 400 = already at slot 1 going up / slot 3 going down. The buttons are disabled at the
        // bounds, so this only fires if the grid is stale.
        const detail =
          err?.status === 400 ? '已經在第一個或最後一個位置。' : '移動失敗，請稍後再試。';
        this.messages.add({ severity: 'warn', summary: '無法移動', detail });
        this.load();
      },
    });
  }

  protected canMoveUp(row: SlotRow): boolean {
    return !!row.item && row.slot > SLOTS[0];
  }

  protected canMoveDown(row: SlotRow): boolean {
    return !!row.item && row.slot < SLOTS[SLOTS.length - 1];
  }

  protected remove(item: FeaturedPromoItem): void {
    const day = fromIso(item.scheduleOn);
    const when = day ? `${shortDate(day)} (${weekdayLabel(day)})` : item.scheduleOn;

    this.confirm.confirm({
      header: '刪除確認',
      // Nothing FK-references FeaturedPromoItem and it cascades to nothing, so this delete really
      // is isolated — no "children will also be deleted" warning is warranted here.
      message: `確定要刪除 ${when} 第 ${item.slot} 欄「${item.promotion?.promoCode ?? item.topic}」？`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.service.delete(item.pkid).subscribe({
          next: () => {
            this.closePanel();
            this.messages.add({ severity: 'success', summary: '已刪除', detail: '資料已刪除。' });
            this.load();
          },
          error: () => {
            this.messages.add({
              severity: 'error',
              summary: '刪除失敗',
              detail: '無法刪除該筆資料。',
            });
          },
        });
      },
    });
  }

  // --- sessionStorage ------------------------------------------------------

  private restoreFilters(): void {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as PersistedFilters;
      if (typeof saved.trainingCenterPkid === 'number') {
        this.activeTcPkid.set(saved.trainingCenterPkid);
      }
      // Re-normalise to a Monday: a hand-edited or stale value must not skew the whole grid.
      const savedWeek = fromIso(saved.weekStart);
      if (savedWeek) this.weekStart.set(startOfWeek(savedWeek));
    } catch {
      sessionStorage.removeItem(FILTERS_KEY);
    }
  }

  private persistFilters(): void {
    const filters: PersistedFilters = {
      trainingCenterPkid: this.activeTcPkid(),
      weekStart: toIso(this.weekStart()),
    };
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  }
}
