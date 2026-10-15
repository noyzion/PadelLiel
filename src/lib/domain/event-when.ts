import { isValidDateString, israelEndOfDate, israelLocalToInstant } from '@/lib/time';

/**
 * When a community event happens. Exactly one of three states, mirroring the database
 * (`community_events_when_exclusive`):
 *   timed     - a real start (and optional end) instant, as typed in Israel time.
 *   date only - a calendar date, or a date range, with NO clock time. May be published: trainees then see
 *               "השעה תפורסם בהמשך". Nothing here ever invents a time.
 *   undated   - no date at all. Always a draft: an event cannot be published without a date.
 */
export type EventWhen =
  | { kind: 'timed'; startsAt: Date; endsAt: Date | null }
  | { kind: 'dateOnly'; dateStart: string; dateEnd: string | null }
  | { kind: 'undated' };

export type EventWhenResult =
  | { ok: true; when: EventWhen }
  | { ok: false; path: 'startsAt' | 'endsAt'; message: string };

export const WHEN_INVALID = 'תאריך או שעה לא תקינים';
export const WHEN_END_BEFORE_START = 'שעת הסיום חייבת להיות אחרי שעת ההתחלה';
export const WHEN_END_DATE_BEFORE_START = 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה';
export const WHEN_PUBLISH_NEEDS_DATE = 'כדי לפרסם אירוע יש להוסיף תאריך';
export const WHEN_MULTI_DAY_NEEDS_END_TIME = 'באירוע רב־יומי עם שעת התחלה יש להזין גם שעת סיום';
export const WHEN_END_TIME_NEEDS_START_TIME = 'יש להזין שעת התחלה לפני שעת סיום';
export const WHEN_END_NEEDS_DATE = 'יש להזין תאריך התחלה';

/** "2026-11-02T18:30" (timed) or "2026-11-02" (date only), both Israel time; anything else is invalid. */
export function isValidWhenValue(value: string): boolean {
  return israelLocalToInstant(value) !== null || isValidDateString(value);
}

/**
 * Validates the typed start / end and resolves them. An empty start is "undated", which cannot be published.
 * The values are what a `datetime-local` / `date` input produces.
 */
export function parseEventWhen(startsAt: string, endsAt: string | undefined, publishing: boolean): EventWhenResult {
  const end = endsAt || undefined;

  if (!startsAt) {
    if (publishing) return { ok: false, path: 'startsAt', message: WHEN_PUBLISH_NEEDS_DATE };
    if (end) return { ok: false, path: 'startsAt', message: WHEN_END_NEEDS_DATE };
    return { ok: true, when: { kind: 'undated' } };
  }

  const startInstant = israelLocalToInstant(startsAt);
  const startIsDate = startInstant === null && isValidDateString(startsAt);
  if (startInstant === null && !startIsDate) return { ok: false, path: 'startsAt', message: WHEN_INVALID };

  const endInstant = end ? israelLocalToInstant(end) : null;
  const endIsDate = Boolean(end) && endInstant === null && isValidDateString(end!);
  if (end && endInstant === null && !endIsDate) return { ok: false, path: 'endsAt', message: WHEN_INVALID };

  if (startInstant) {
    // Timed: a multi-day event with a start time also needs an end time (a bare end date would hide a time).
    if (endIsDate) return { ok: false, path: 'endsAt', message: WHEN_MULTI_DAY_NEEDS_END_TIME };
    if (endInstant && endInstant.getTime() <= startInstant.getTime()) {
      return { ok: false, path: 'endsAt', message: WHEN_END_BEFORE_START };
    }
    return { ok: true, when: { kind: 'timed', startsAt: startInstant, endsAt: endInstant } };
  }

  // Date only (draft or published): a date, or a date range, and never a time.
  if (endInstant) return { ok: false, path: 'endsAt', message: WHEN_END_TIME_NEEDS_START_TIME };
  if (endIsDate && end! <= startsAt) return { ok: false, path: 'endsAt', message: WHEN_END_DATE_BEFORE_START };
  return { ok: true, when: { kind: 'dateOnly', dateStart: startsAt, dateEnd: endIsDate ? end! : null } };
}

/** The four `community_events` columns that describe the "when" (the unused ones are always null). */
export interface EventWhenColumns {
  startsAt: string | null;
  endsAt: string | null;
  dateStart: string | null;
  dateEnd: string | null;
}

export function eventWhenColumns(when: EventWhen): EventWhenColumns {
  switch (when.kind) {
    case 'timed':
      return { startsAt: when.startsAt.toISOString(), endsAt: when.endsAt?.toISOString() ?? null, dateStart: null, dateEnd: null };
    case 'dateOnly':
      return { startsAt: null, endsAt: null, dateStart: when.dateStart, dateEnd: when.dateEnd };
    case 'undated':
      return { startsAt: null, endsAt: null, dateStart: null, dateEnd: null };
  }
}

/** End of the last calendar day of a date-only event (the generated `effective_ends_at`, same rule as the database). */
export function dateOnlyEffectiveEnd(dateStart: string, dateEnd: string | null): Date {
  return israelEndOfDate(dateEnd ?? dateStart);
}
