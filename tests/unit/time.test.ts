import { describe, expect, it } from 'vitest';
import {
  addDays,
  currentWeekStart,
  dayOfWeek,
  formatDateHe,
  formatInstantHe,
  formatMonthCycleHe,
  formatMonthHe,
  formatTimeRange,
  formatWeekRangeHe,
  isValidDateString,
  monthStartOf,
  israelToday,
  parseWeekParam,
  shiftMonth,
  shiftWeek,
  weekDates,
  weekEndOf,
  weekStartOf,
} from '@/lib/time';

describe('week arithmetic (Sunday-Saturday)', () => {
  it('finds the Sunday that starts a week for every weekday', () => {
    // 2026-11-01 is a Sunday
    expect(weekStartOf('2026-11-01')).toBe('2026-11-01');
    expect(weekStartOf('2026-11-02')).toBe('2026-11-01');
    expect(weekStartOf('2026-11-07')).toBe('2026-11-01'); // Saturday
    expect(weekStartOf('2026-11-08')).toBe('2026-11-08'); // next Sunday
  });

  it('computes week end, shifts weeks and lists the 7 dates', () => {
    expect(weekEndOf('2026-11-04')).toBe('2026-11-07');
    expect(shiftWeek('2026-11-04', 1)).toBe('2026-11-08');
    expect(shiftWeek('2026-11-04', -2)).toBe('2026-10-18');
    expect(weekDates('2026-11-04')).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    ]);
  });

  it('is unaffected by daylight-saving changes', () => {
    // Israel DST starts Fri 2026-03-27 and ends Sun 2026-10-25.
    expect(weekStartOf('2026-03-27')).toBe('2026-03-22');
    expect(weekDates('2026-03-27')).toHaveLength(7);
    expect(addDays('2026-03-26', 1)).toBe('2026-03-27');
    expect(addDays('2026-03-27', 1)).toBe('2026-03-28');
    expect(weekStartOf('2026-10-25')).toBe('2026-10-25');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(shiftWeek('2026-10-18', 1)).toBe('2026-10-25');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-27');
    expect(dayOfWeek('2026-10-10')).toBe(6);
  });
});

describe('month arithmetic (monthly session quota)', () => {
  it('finds the first day of the month for any date', () => {
    expect(monthStartOf('2026-11-01')).toBe('2026-11-01');
    expect(monthStartOf('2026-11-30')).toBe('2026-11-01');
    expect(monthStartOf('2028-02-29')).toBe('2028-02-01');
    expect(() => monthStartOf('2026-02-31')).toThrow();
  });

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-11-18', 1)).toBe('2026-12-01');
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftMonth('2026-03-01', -3)).toBe('2025-12-01');
  });

  it('formats the month in Hebrew', () => {
    expect(formatMonthHe('2026-11-18')).toBe('נובמבר 2026');
    expect(formatMonthHe('2027-01-01')).toBe('ינואר 2027');
  });

  it('formats the 1st-to-1st cycle', () => {
    expect(formatMonthCycleHe('2026-11-18')).toBe('1.11 – 1.12');
    expect(formatMonthCycleHe('2026-12-01')).toBe('1.12 – 1.1');
  });
});

describe('validation', () => {
  it('accepts only real calendar dates', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
    expect(isValidDateString('2026-2-3')).toBe(false);
  });

  it('parses ?week= safely and falls back to the current week', () => {
    const now = new Date('2026-10-29T07:00:00Z');
    expect(parseWeekParam('2026-11-04', now)).toBe('2026-11-01');
    expect(parseWeekParam(['2026-11-04', 'x'], now)).toBe('2026-11-01');
    expect(parseWeekParam('garbage', now)).toBe('2026-10-25');
    expect(parseWeekParam(undefined, now)).toBe('2026-10-25');
  });
});

describe('Israel "today"', () => {
  it('uses the Israel calendar date, not UTC', () => {
    // 22:30 UTC on 28 Oct = 00:30 on 29 Oct in Israel (UTC+2).
    expect(israelToday(new Date('2026-10-28T22:30:00Z'))).toBe('2026-10-29');
    // 21:30 UTC is still the 28th locally.
    expect(israelToday(new Date('2026-10-28T21:30:00Z'))).toBe('2026-10-28');
  });

  it('handles the summer offset (UTC+3)', () => {
    expect(israelToday(new Date('2026-07-06T20:59:59Z'))).toBe('2026-07-06');
    expect(israelToday(new Date('2026-07-06T21:00:00Z'))).toBe('2026-07-07');
  });

  it('week rolls over at Israel midnight on Saturday night', () => {
    // Saturday 2026-11-07 23:59 Israel = 21:59Z; Sunday 00:00 Israel = 22:00Z.
    expect(currentWeekStart(new Date('2026-11-07T21:59:59Z'))).toBe('2026-11-01');
    expect(currentWeekStart(new Date('2026-11-07T22:00:00Z'))).toBe('2026-11-08');
  });
});

describe('Hebrew formatting', () => {
  it('formats dates, ranges and times', () => {
    expect(formatDateHe('2026-11-02')).toBe('יום שני, 2.11');
    expect(formatWeekRangeHe('2026-11-04')).toBe('1.11 - 7.11');
    expect(formatTimeRange('07:00:00', '08:00:00')).toBe('07:00-08:00');
  });

  it('formats instants in Israel time', () => {
    const text = formatInstantHe('2026-11-01T21:00:00Z'); // Sunday 23:00 Israel
    expect(text).toContain('23:00');
    expect(text).toContain('01.11');
  });
});
