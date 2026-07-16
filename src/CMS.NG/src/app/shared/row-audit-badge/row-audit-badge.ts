import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';

import { RowAuditService } from '@core/services/row-audit.service';
import { RowAuditEntry } from '@core/models/row-audit.model';

/**
 * 異動紀錄 History badge for a detail/form page header. Two inputs — `tableName` (the real DB
 * table name, e.g. "Course") and the record's `pkid` — fetch the record's RowAudit trail on load.
 * The badge shows the latest entry inline ("Update by alice · 2026-06-04 14:30"); clicking it
 * opens a dialog with the full trail, newest first (the API already orders it).
 *
 * On a create form there is no record yet: pass `null` and the badge renders its neutral
 * "no history" state without calling the API.
 */
@Component({
  selector: 'app-row-audit-badge',
  imports: [CommonModule, DialogModule],
  templateUrl: './row-audit-badge.html',
  styleUrl: './row-audit-badge.scss',
})
export class RowAuditBadge {
  private readonly service = inject(RowAuditService);

  /** Real DB table name — must match what the repositories write into RowAudit.TableName. */
  readonly tableName = input.required<string>();

  /** The record's pkid; null until the record loads (or on a create form — then no fetch). */
  readonly pkid = input<number | string | null>(null);

  protected readonly trail = signal<RowAuditEntry[]>([]);
  protected readonly loaded = signal(false);
  protected readonly dialogVisible = signal(false);

  protected readonly latest = computed<RowAuditEntry | null>(() => this.trail()[0] ?? null);

  constructor() {
    // Refetches when the inputs settle/change (detail pages set pkid only after their own load).
    effect(() => {
      const tableName = this.tableName();
      const pkid = this.pkid();
      if (pkid === null || pkid === undefined || pkid === '') {
        this.trail.set([]);
        this.loaded.set(true);
        return;
      }
      this.loaded.set(false);
      this.service.getForRecord(tableName, pkid).subscribe({
        next: (rows) => {
          this.trail.set(rows);
          this.loaded.set(true);
        },
        // History is auxiliary chrome — a failed fetch degrades to the empty state, it must
        // never break the page hosting it.
        error: () => {
          this.trail.set([]);
          this.loaded.set(true);
        },
      });
    });
  }

  protected open(): void {
    this.dialogVisible.set(true);
  }
}
