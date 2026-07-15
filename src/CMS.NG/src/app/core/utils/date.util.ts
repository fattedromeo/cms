/**
 * Date helpers for `date`-typed API fields (C# `DateOnly`), which serialize as plain
 * `yyyy-MM-dd` strings with no time part and no timezone.
 *
 * The whole point of this file is to keep UTC out of the conversion. The app runs in UTC+8, so
 * the obvious implementations are both off by one day:
 *
 *   - `d.toISOString().split('T')[0]` converts to UTC first -> a date picked as 2026-03-01 00:00
 *     local serializes as "2026-02-28".
 *   - `new Date('2026-03-01')` parses as UTC midnight -> renders as 2026-02-29 in UTC+8.
 *
 * Always go through `toIso` / `fromIso`, which use local date components only.
 */

/** Serialize a Date to `yyyy-MM-dd` using LOCAL components. Never uses toISOString(). */
export function toIso(d: Date): string {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse an API `yyyy-MM-dd` string into a Date at LOCAL midnight. */
export function fromIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [year, month, day] = s.split('-').map(Number);
  if (!year || !month || !day) return null;
  // Component constructor -> local midnight. `new Date(s)` would parse as UTC.
  return new Date(year, month - 1, day);
}

/** Add whole years to a date, preserving the local time-of-day. */
export function addYears(d: Date, years: number): Date {
  const result = new Date(d.getTime());
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Add whole days, normalising to LOCAL midnight. Rolls over months/years via setDate.
 * Used to walk the FeaturedPromoItem week grid (Monday + 0..6).
 */
export function addDays(d: Date, days: number): Date {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * The MONDAY of the week containing `d`, at local midnight.
 *
 * The FeaturedPromoItem grid is Monday-to-Sunday, but JS `getDay()` is Sunday-based (0 = Sunday),
 * so Sunday must walk BACK six days rather than forward one. Getting that wrong shifts the whole
 * grid by a week for exactly one day in seven — the kind of bug that only shows up on a Sunday.
 */
export function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  return addDays(d, offsetToMonday);
}

/** Traditional-Chinese weekday initials, indexed by JS `getDay()` (0 = Sunday). */
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** Weekday initial for the grid's day headers — the 「一」 in `3/16 (一)`. */
export function weekdayLabel(d: Date): string {
  return WEEKDAY_LABELS[d.getDay()];
}

/** `M/D` for the day headers and the week navigator — no leading zeros, matching the mockup. */
export function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
