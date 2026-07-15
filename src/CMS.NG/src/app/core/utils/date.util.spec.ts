import {
  addDays,
  addYears,
  fromIso,
  shortDate,
  startOfWeek,
  toIso,
  weekdayLabel,
} from './date.util';

describe('date.util', () => {
  describe('toIso', () => {
    it('serializes using local date components', () => {
      expect(toIso(new Date(2026, 2, 1))).toBe('2026-03-01');
    });

    it('zero-pads month and day', () => {
      expect(toIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    /**
     * The regression this file exists for: in UTC+8, local midnight on 2026-03-01 is
     * 2026-02-28T16:00Z, so toISOString().split('T')[0] would yield "2026-02-28".
     */
    it('does not shift the day for a local midnight date (the UTC+8 off-by-one)', () => {
      const localMidnight = new Date(2026, 2, 1, 0, 0, 0);
      expect(toIso(localMidnight)).toBe('2026-03-01');
    });

    it('is unaffected by time-of-day', () => {
      expect(toIso(new Date(2026, 2, 1, 23, 59, 59))).toBe('2026-03-01');
      expect(toIso(new Date(2026, 2, 1, 0, 0, 0))).toBe('2026-03-01');
    });
  });

  describe('fromIso', () => {
    it('parses to a LOCAL midnight date, not UTC midnight', () => {
      const d = fromIso('2026-03-01')!;
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(2); // 0-based March
      expect(d.getDate()).toBe(1);
      expect(d.getHours()).toBe(0);
    });

    it('returns null for null/empty input', () => {
      expect(fromIso(null)).toBeNull();
      expect(fromIso('')).toBeNull();
      expect(fromIso(undefined)).toBeNull();
    });

    it('round-trips with toIso', () => {
      expect(toIso(fromIso('2026-03-01')!)).toBe('2026-03-01');
      expect(toIso(fromIso('2019-11-11')!)).toBe('2019-11-11');
    });
  });

  describe('addYears', () => {
    it('adds whole years', () => {
      expect(toIso(addYears(new Date(2026, 2, 1), 10))).toBe('2036-03-01');
    });

    it('does not mutate the input', () => {
      const d = new Date(2026, 2, 1);
      addYears(d, 10);
      expect(toIso(d)).toBe('2026-03-01');
    });
  });

  // --- Week helpers for the FeaturedPromoItem grid -------------------------
  // 2026-03-16 is a Monday, so 03-16..03-22 is one grid week (the mockup's week).

  describe('addDays', () => {
    it('adds within a month', () => {
      expect(toIso(addDays(new Date(2026, 2, 16), 6))).toBe('2026-03-22');
    });

    it('rolls over a month boundary', () => {
      expect(toIso(addDays(new Date(2026, 2, 30), 7))).toBe('2026-04-06');
    });

    it('rolls over a year boundary', () => {
      expect(toIso(addDays(new Date(2026, 11, 28), 7))).toBe('2027-01-04');
    });

    it('subtracts with a negative delta', () => {
      expect(toIso(addDays(new Date(2026, 2, 16), -7))).toBe('2026-03-09');
    });

    it('handles a leap day', () => {
      expect(toIso(addDays(new Date(2028, 1, 28), 1))).toBe('2028-02-29');
    });

    it('normalises to local midnight', () => {
      expect(addDays(new Date(2026, 2, 16, 23, 45), 1).getHours()).toBe(0);
    });

    it('does not mutate the input', () => {
      const d = new Date(2026, 2, 16);
      addDays(d, 10);
      expect(toIso(d)).toBe('2026-03-16');
    });
  });

  describe('startOfWeek', () => {
    it('returns the same day when given a Monday', () => {
      expect(toIso(startOfWeek(new Date(2026, 2, 16)))).toBe('2026-03-16');
    });

    it('walks back to Monday from mid-week', () => {
      expect(toIso(startOfWeek(new Date(2026, 2, 19)))).toBe('2026-03-16'); // Thursday
    });

    /**
     * The regression this guards: getDay() is Sunday-based (0), so a naive `1 - day` sends Sunday
     * FORWARD to the next Monday and shifts the entire grid by a week — on one day in seven.
     */
    it('walks BACK six days from a Sunday, not forward one', () => {
      const sunday = new Date(2026, 2, 22);
      expect(sunday.getDay()).toBe(0);
      expect(toIso(startOfWeek(sunday))).toBe('2026-03-16');
    });

    it('walks back to Monday from a Saturday', () => {
      expect(toIso(startOfWeek(new Date(2026, 2, 21)))).toBe('2026-03-16');
    });

    it('crosses a month boundary', () => {
      // Wednesday 2026-04-01 -> Monday 2026-03-30.
      expect(toIso(startOfWeek(new Date(2026, 3, 1)))).toBe('2026-03-30');
    });

    it('crosses a year boundary', () => {
      // Friday 2027-01-01 -> Monday 2026-12-28.
      expect(toIso(startOfWeek(new Date(2027, 0, 1)))).toBe('2026-12-28');
    });

    it('is idempotent', () => {
      const once = startOfWeek(new Date(2026, 2, 19));
      expect(toIso(startOfWeek(once))).toBe(toIso(once));
    });

    it('normalises to local midnight', () => {
      const mid = startOfWeek(new Date(2026, 2, 19, 23, 45, 30));
      expect(mid.getHours()).toBe(0);
      expect(mid.getMinutes()).toBe(0);
    });

    it('maps every day of one week to the same Monday', () => {
      const isos = [16, 17, 18, 19, 20, 21, 22].map((d) =>
        toIso(startOfWeek(new Date(2026, 2, d))),
      );
      expect(new Set(isos).size).toBe(1);
      expect(isos[0]).toBe('2026-03-16');
    });

    it('a fromIso -> startOfWeek round trip does not drift', () => {
      expect(toIso(startOfWeek(fromIso('2026-03-22')!))).toBe('2026-03-16');
    });
  });

  describe('week span', () => {
    it('Sunday is Monday + 6, so the inclusive range covers exactly 7 days', () => {
      // The API filter is inclusive at BOTH ends; +7 would pull in the next Monday's rows.
      const monday = startOfWeek(new Date(2026, 2, 18));
      const sunday = addDays(monday, 6);
      expect(toIso(monday)).toBe('2026-03-16');
      expect(toIso(sunday)).toBe('2026-03-22');
      expect(sunday.getDay()).toBe(0);
    });
  });

  describe('weekdayLabel', () => {
    it('labels Monday through Sunday in Traditional Chinese', () => {
      const monday = new Date(2026, 2, 16);
      const labels = Array.from({ length: 7 }, (_, i) => weekdayLabel(addDays(monday, i)));
      expect(labels).toEqual(['一', '二', '三', '四', '五', '六', '日']);
    });
  });

  describe('shortDate', () => {
    it('formats M/D with no leading zeros', () => {
      expect(shortDate(new Date(2026, 2, 16))).toBe('3/16');
      expect(shortDate(new Date(2026, 0, 5))).toBe('1/5');
    });
  });
});
