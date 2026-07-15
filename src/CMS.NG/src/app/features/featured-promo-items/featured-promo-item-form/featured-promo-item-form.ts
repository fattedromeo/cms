import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { InputTextModule } from 'primeng/inputtext';

import {
  FeaturedPromoItem,
  FeaturedPromoItemClipboard,
  FeaturedPromoItemRequest,
} from '@core/models/featured-promo-item.model';
import { LookupItem } from '@core/models/lookup-item.model';

/** Shape PrimeNG's AutoComplete passes to `completeMethod`. */
interface CompleteEvent {
  query: string;
}

/**
 * The inline Edit / New / Paste panel that opens inside a week-grid slot.
 *
 * Not a routed page: unlike every other feature there is no `{table}-detail` and no `/new` route,
 * because the grid itself IS the detail view and a row only means anything inside its
 * (date, center, slot) cell. The panel therefore takes the cell as inputs and emits a request
 * rather than navigating or saving on its own.
 */
@Component({
  selector: 'app-featured-promo-item-form',
  imports: [CommonModule, ReactiveFormsModule, AutoCompleteModule, InputTextModule],
  templateUrl: './featured-promo-item-form.html',
  styleUrl: './featured-promo-item-form.scss',
})
export class FeaturedPromoItemForm implements OnInit {
  private readonly fb = inject(FormBuilder);

  // --- The cell being filled. Fixed for the panel's lifetime: the form never moves an item to a
  // different day/center, and Slot is owned by the grid's 「+」/「--」 buttons.
  readonly scheduleOn = input.required<string>();
  readonly trainingCenterPkid = input.required<number>();
  readonly slot = input.required<number>();

  /** The existing row when editing; null for New and Paste. */
  readonly item = input<FeaturedPromoItem | null>(null);

  /** Values to pre-seed a New panel with (the Paste button). Ignored when `item` is set. */
  readonly seed = input<FeaturedPromoItemClipboard | null>(null);

  /** All 1,157 promos; filtered client-side by the type-ahead. */
  readonly promoOptions = input.required<LookupItem[]>();

  readonly saved = output<FeaturedPromoItemRequest>();
  readonly cancelled = output<void>();

  protected readonly suggestions = signal<LookupItem[]>([]);

  protected readonly form = this.fb.group({
    // Holds the whole LookupItem, not just the code — the API needs Promotion_pkid, and the label
    // is what the editor types. `forceSelection` in the template stops free text resolving to null.
    promotion: [null as LookupItem | null, Validators.required],
    // Lengths mirror the schema (nvarchar(100) / nvarchar(300)).
    topic: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.maxLength(300)]],
  });

  ngOnInit(): void {
    const existing = this.item();
    const seeded = this.seed();

    if (existing) {
      this.form.patchValue({
        promotion: this.findPromo(existing.promotionPkid),
        topic: existing.topic,
        description: existing.description,
      });
    } else if (seeded) {
      // Paste replays the copied payload into an empty cell; the cell itself comes from the inputs.
      this.form.patchValue({
        promotion: this.findPromo(seeded.promotionPkid),
        topic: seeded.topic,
        description: seeded.description,
      });
    }
    // Plain New: leave everything blank, matching ui-new.spec.png.
  }

  protected filterPromos(event: CompleteEvent): void {
    const q = (event.query ?? '').toLowerCase();
    this.suggestions.set(
      this.promoOptions().filter((o) => o.label.toLowerCase().includes(q)),
    );
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.saved.emit({
      // 0 tells the grid (and the API's IDENTITY insert) that this is a create.
      pkid: this.item()?.pkid ?? 0,
      scheduleOn: this.scheduleOn(),
      trainingCenterPkid: this.trainingCenterPkid(),
      slot: this.slot(),
      // LookupItem.pkid is a STRING; promotionPkid is a number. Without Number() the API would
      // reject the body — and a p-select bound to the raw string would silently show blank.
      promotionPkid: Number(raw.promotion!.pkid),
      topic: raw.topic!.trim(),
      description: raw.description!.trim(),
    });
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  /** Resolve a stored numeric FK back to its lookup option so the type-ahead shows the code. */
  private findPromo(promotionPkid: number): LookupItem | null {
    return this.promoOptions().find((o) => Number(o.pkid) === promotionPkid) ?? null;
  }

  protected invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
