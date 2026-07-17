import { Component, computed, input, output } from '@angular/core';

import { environment } from '@env/environment';
import { Course } from '@core/models/course.model';
import { toIso } from '@core/utils/date.util';

interface FactCell {
  label: string;
  value: string;
  /** 定價 renders dominant — the student's first question across the counter. */
  dominant?: boolean;
}

interface SheetSection {
  title: string;
  text: string;
  /**
   * 課程大綱 is nvarchar(max): it must be allowed to break across pages (an avoid-rule on it
   * would shove the whole section to page 2 and hollow out page 1). Short sections stay whole.
   */
  long: boolean;
}

/**
 * Pure presentational A4 flyer sheet — course + labels in, print-ready markup out.
 * Zero route awareness: this component is the page unit of the future batch catalog
 * (a catalog is N sheets in a loop with `break-after: page`). See spec/course/CourseFlyer.md.
 */
@Component({
  selector: 'app-course-flyer-sheet',
  imports: [],
  templateUrl: './course-flyer-sheet.html',
  styleUrl: './course-flyer-sheet.scss',
})
export class CourseFlyerSheet {
  readonly course = input.required<Course>();
  readonly certificationLabels = input<string[]>([]);
  /** Bare QR PNG data URL; empty while rendering. */
  readonly qrDataUrl = input<string>('');
  /** True when QR generation failed — the slot shows a visible error, never a blank. */
  readonly qrError = input(false);
  /** Fires when the QR <img> has decoded — the page uses it to time auto-print. */
  readonly qrImageLoaded = output<void>();
  /** Fires when the QR <img> fails to decode a set src — the page turns this into a loud error. */
  readonly qrImageError = output<void>();

  protected readonly brand = environment.flyer;

  /** yyyy/MM/dd from local date parts — never toISOString (rule 17: UTC+8 shifts the day). */
  protected readonly generatedDate = toIso(new Date()).replaceAll('-', '/');

  protected readonly facts = computed<FactCell[]>(() => {
    const c = this.course();
    const cells: FactCell[] = [];

    // Hour = 0 rows exist in dev data (9 of them) — an empty cell is omitted, never "0 小時".
    if (c.hour > 0) {
      cells.push({ label: '課程時數', value: `${c.hour} 小時` });
    }

    // ListPrice = 0 (the column default) means "ask at counter", not free — verified in dev data.
    cells.push({
      label: '定價',
      value: c.listPrice > 0 ? `NT$ ${c.listPrice.toLocaleString('en-US')}` : '洽詢',
      dominant: true,
    });

    cells.push({ label: '課程代號', value: c.courseId });

    // Overflow rule: first 2 labels + 等 N 項認證, one line — never wrap the strip.
    const certs = this.certificationLabels();
    if (certs.length > 0) {
      cells.push({
        label: '相關認證',
        value: certs.length <= 2 ? certs.join('、') : `${certs.slice(0, 2).join('、')} 等 ${certs.length} 項認證`,
      });
    }

    return cells;
  });

  /** Empty sections are omitted entirely — a bare heading is the database-dump look. */
  protected readonly sections = computed<SheetSection[]>(() => {
    const c = this.course();
    return [
      { title: '課程目標', text: stripHtml(c.objective), long: false },
      { title: '適合對象', text: stripHtml(c.target), long: false },
      { title: '先修條件', text: stripHtml(c.prerequisites), long: false },
      { title: '課程大綱', text: stripHtml(c.outline), long: true },
    ].filter((s) => s.text.trim().length > 0);
  });
}

/**
 * Real rows embed HTML fragments (`<font color=…>`, `<sup>®</sup>` — found by print-PDF
 * verification against the SSCP row). The flyer renders plain text, so tags must be stripped,
 * not printed literally. Extract-only: DOMParser DECODES the string into an inert document and
 * we read textContent — nothing is ever inserted into the live DOM, so the innerHTML/XSS ban
 * stands. Newlines in the source survive (they are text nodes, not markup).
 */
function stripHtml(value: string | null): string {
  if (!value) return '';
  if (!value.includes('<')) return value; // fast path: most rows carry no markup
  return new DOMParser().parseFromString(value, 'text/html').body.textContent ?? '';
}
