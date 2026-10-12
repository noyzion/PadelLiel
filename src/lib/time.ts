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

/** The first day of the calendar month containing `date` (the key of the monthly session quota). */
export function monthStartOf(date: string): string {
  toUtcDate(date); // validates
  return `${date.slice(0, 7)}-01`;
}

/** Adds (or subtracts) whole calendar months to a month start. */
export function shiftMonth(monthStart: string, months: number): string {
  const dt = toUtcDate(monthStartOf(monthStart));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return fromUtcDate(dt);
}

export function currentMonthStart(now: Date = new Date()): string {
  return monthStartOf(israelToday(now));
}

export const MONTH_NAMES_HE = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
] as const;

/** "נובמבר 2026" for the month containing `date`. */
export function formatMonthHe(date: string): string {
  const [y, m] = monthStartOf(date).split('-').map(Number);
  return `${MONTH_NAMES_HE[m - 1]} ${y}`;
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

/** Time-aware Hebrew greeting. */
export function greetingHe(now: Date = new Date()): { text: string } {
  const hour = israelHour(now);
  if (hour >= 5 && hour < 12) return { text: 'בוקר טוב' };
  if (hour >= 12 && hour < 17) return { text: 'צהריים טובים' };
  if (hour >= 17 && hour < 21) return { text: 'ערב טוב' };
  return { text: 'לילה טוב' };
}
/* ------------------------------------------------------------------ */
/* Community events: instants displayed / entered in Israel time        */
/* ------------------------------------------------------------------ */

const ISRAEL_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: COMMUNITY_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Wall-clock components of an instant in Israel. */
function israelWallClock(at: Date) {
  const parts = ISRAEL_PARTS.formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Israel's UTC offset (ms, positive = ahead of UTC) at the given instant. DST-aware. */
function israelOffsetMs(at: Date): number {
  const w = israelWallClock(at);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Converts what a staff member typed into a `datetime-local` input ("2026-11-02T18:30", Israel wall-clock time)
 * into the exact instant. Returns null for malformed values, impossible dates, and wall-clock times that do not
 * exist in Israel (the hour skipped when daylight saving time starts).
 */
export function israelLocalToInstant(local: string): Date | null {
  const m = LOCAL_DATETIME_RE.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (!isValidDateString(`${m[1]}-${m[2]}-${m[3]}`)) return null;

  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes: the offset must be read at the *target* instant, which depends on the offset.
  let guess = wall - israelOffsetMs(new Date(wall));
  guess = wall - israelOffsetMs(new Date(guess));
  const result = new Date(guess);

  const back = israelWallClock(result);
  const roundTrips = back.year === y && back.month === mo && back.day === d && back.hour === h && back.minute === mi;
  return roundTrips ? result : null;
}

/** The inverse of `israelLocalToInstant`: an instant as a `datetime-local` value in Israel time. */
export function instantToIsraelLocal(iso: string): string {
  const w = israelWallClock(new Date(iso));
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${String(w.year).padStart(4, '0')}-${p2(w.month)}-${p2(w.day)}T${p2(w.hour)}:${p2(w.minute)}`;
}

function eventFormat(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('he-IL', { timeZone: COMMUNITY_TIME_ZONE, ...options });
}

/** "יום שני, 2 בנובמבר 2026" */
export function formatEventDateHe(iso: string): string {
  return eventFormat({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

/** "2 בנובמבר" (no year, for compact lists) */
export function formatEventDayMonthHe(iso: string): string {
  return eventFormat({ day: 'numeric', month: 'long' }).format(new Date(iso));
}

/** "יום שני" */
export function formatEventWeekdayHe(iso: string): string {
  return eventFormat({ weekday: 'long' }).format(new Date(iso));
}

/** "יום שני, 2 בנובמבר" (no year, for compact lists) */
export function formatEventDayCompactHe(iso: string): string {
  return `${formatEventWeekdayHe(iso)}, ${formatEventDayMonthHe(iso)}`;
}

/** "2" */
export function formatEventDayNumberHe(iso: string): string {
  return eventFormat({ day: 'numeric' }).format(new Date(iso));
}

/** "נובמבר" */
export function formatEventMonthHe(iso: string): string {
  return eventFormat({ month: 'long' }).format(new Date(iso));
}

/** "18:30" (24-hour, Israel time) */
export function formatEventTimeHe(iso: string): string {
  return eventFormat({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** The Israel calendar date ("YYYY-MM-DD") of an instant. */
export function israelDateOf(iso: string): string {
  return israelToday(new Date(iso));
}

/**
 * The "when" of an event for display (`compact` drops the year, for cards).
 *   same day / no end: date = "יום שני, 2 בנובמבר 2026", time = "18:30–20:00" (or "18:30")
 *   spans days:        date = "2 בנובמבר, 18:30 – 3 בנובמבר, 12:00", time = null
 */
export function formatEventWhenHe(
  startsAt: string,
  endsAt: string | null,
  compact = false,
): { date: string; time: string | null } {
  const day = compact ? formatEventDayCompactHe : formatEventDateHe;
  if (!endsAt) return { date: day(startsAt), time: formatEventTimeHe(startsAt) };
  if (israelDateOf(startsAt) === israelDateOf(endsAt)) {
    return { date: day(startsAt), time: `${formatEventTimeHe(startsAt)}–${formatEventTimeHe(endsAt)}` };
  }
  return {
    date: `${formatEventDayMonthHe(startsAt)}, ${formatEventTimeHe(startsAt)} – ${formatEventDayMonthHe(endsAt)}, ${formatEventTimeHe(endsAt)}`,
    time: null,
  };
}