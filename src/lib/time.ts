/**
 * Date helpers for the community timezone (Asia/Jerusalem).
 *
 * These are for DISPLAY and NAVIGATION only. Every business rule (allowance, cancellation
 * cutoff, week attribution, capacity) is decided by the database — see supabase/migrations.
 *
 * Calendar dates are handled as plain `YYYY-MM-DD` strings so daylight-saving changes can
 * never shift a day or a week.
 */

export const COMMUNITY_TIME_ZONE = 'Asia/Jerusalem';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtcDate(value: string): Date {
  if (!isValidDateString(value)) throw new Error(`Invalid date: ${value}`);
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Adds (or subtracts) whole calendar days. */
export function addDays(date: string, days: number): string {
  const dt = toUtcDate(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtcDate(dt);
}

/** Day of week, Sunday = 0 … Saturday = 6. */
export function dayOfWeek(date: string): number {
  return toUtcDate(date).getUTCDay();
}

/** The Sunday that starts the (Sunday–Saturday) week containing `date`. */
export function weekStartOf(date: string): string {
  return addDays(date, -dayOfWeek(date));
}

export function weekEndOf(date: string): string {
  return addDays(weekStartOf(date), 6);
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return addDays(weekStartOf(weekStart), weeks * 7);
}

/** The 7 dates (Sun..Sat) of the week containing `date`. */
export function weekDates(date: string): string[] {
  const start = weekStartOf(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Today's calendar date in Israel for the given instant. */
export function israelToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COMMUNITY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(israelToday(now));
}

/** Parses a user-supplied `?week=` value into a valid week start (falls back to the current week). */
export function parseWeekParam(value: string | string[] | undefined, now: Date = new Date()): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && isValidDateString(raw)) return weekStartOf(raw);
  return currentWeekStart(now);
}

export const WEEKDAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

export function weekdayNameHe(date: string): string {
  return WEEKDAY_NAMES_HE[dayOfWeek(date)];
}

/** "2.11" */
export function formatDayMonth(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d}.${m}`;
}

/** "יום שני, 2.11" */
export function formatDateHe(date: string): string {
  return `יום ${weekdayNameHe(date)}, ${formatDayMonth(date)}`;
}

/** "1.11 – 7.11" for the week containing `date`. */
export function formatWeekRangeHe(date: string): string {
  const start = weekStartOf(date);
  return `${formatDayMonth(start)} – ${formatDayMonth(addDays(start, 6))}`;
}

/** "07:00:00" -> "07:00" */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/** Formats an instant in Israel time, e.g. "ב׳ 02.11, 07:00". */
export function formatInstantHe(iso: string): string {
  const dt = new Date(iso);
  const parts = new Intl.DateTimeFormat('he-IL', {
    timeZone: COMMUNITY_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(dt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')}.${get('month')}, ${get('hour')}:${get('minute')}`;
}

/** Whole-hour formatting for the cancellation cutoff ("8" / "1.5"). */
export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
}

/** Hour of day (0-23) in Israel for the given instant. */
export function israelHour(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: COMMUNITY_TIME_ZONE, hour: '2-digit', hour12: false }).format(now);
  return Number(hour) % 24;
}

/** Time-aware Hebrew greeting. Only the morning greeting carries the sun. */
export function greetingHe(now: Date = new Date()): { text: string; emoji: string | null } {
  const hour = israelHour(now);
  if (hour >= 5 && hour < 12) return { text: 'בוקר טוב', emoji: '☀️' };
  if (hour >= 12 && hour < 17) return { text: 'צהריים טובים', emoji: null };
  if (hour >= 17 && hour < 21) return { text: 'ערב טוב', emoji: null };
  return { text: 'לילה טוב', emoji: null };
}