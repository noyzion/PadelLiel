import { isValidDateString, israelEndOfDate, israelLocalToInstant } from '@/lib/time';

/**
 * When a community event happens. Exactly one kind, mirroring the database (`community_events_when_exclusive`):
 *   timed     - a real start (and optional end) instant, as typed in Israel time. Needed to publish.
 *   date only - a calendar date (and optional last date) with NO clock time: an unfinished draft.
 *               Nothing here ever invents a time.
 */
export type EventWhen =
  | { kind: 'timed'; startsAt: Date; endsAt: Date | null }
  | { kind: 'dateOnly'; dateStart: string; dateEnd: string | null };

export type EventWhenResult =
  | { ok: true; when: EventWhen }
  | { ok: false; path: 'startsAt' | 'endsAt'; message: string };

export const WHEN_INVALID = 'תאריך או שעה לא תקינים';
export const WHEN_END_BEFORE_START = 'שעת הסיום חייבת להיות אחרי שעת ההתחלה';
export const WHEN_END_DATE_BEFORE_START = 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה';
export const WHEN_PUBLISH_NEEDS_START = 'כדי לפרסם אירוע יש להוסיף שעת התחלה';
export const WHEN_MULTI_DAY_NEEDS_END_TIME = 'באירוע רב־יומי יש להזין גם שעת סיום';
export const WHEN_END_TIME_NEEDS_START_TIME = 'יש להזין שעת התחלה לפני שעת סיום';

/** "2026-11-02T18:30" (timed) or "2026-11-02" (date only), both Israel time; anything else is invalid. */
export function isValidWhenValue(value: string): boolean {
  return israelLocalToInstant(value) !== null || isValidDateString(value);
}

/**
 * Validates the typed start / end and resolves them. `publishing` events must be timed.
 * The values are what a `datetime-local` / `date` input produces.
 */
export function parseEventWhen(startsAt: string, endsAt: string | undefined, publishing: boolean): EventWhenResult {
  const startInstant = israelLocalToInstant(startsAt);
  const startIsDate = startInstant === null && isValidDateString(startsAt);
  if (startInstant === null && !startIsDate) return { ok: false, path: 'startsAt', message: WHEN_INVALID };

  const end = endsAt || undefined;
  const endInstant = end ? israelLocalToInstant(end) : null;
  const endIsDate = Boolean(end) && endInstant === null && isValidDateString(end!);
  if (end && endInstant === null && !endIsDate) return { ok: false, path: 'endsAt', message: WHEN_INVALID };

  if (startInstant) {
    if (endIsDate) return { ok: false, path: 'endsAt', message: WHEN_MULTI_DAY_NEEDS_END_TIME };
    if (endInstant && endInstant.getTime() <= startInstant.getTime()) {
      return { ok: false, path: 'endsAt', message: WHEN_END_BEFORE_START };
    }
    return { ok: true, when: { kind: 'timed', startsAt: startInstant, endsAt: endInstant } };
  }

  // Date only: allowed for drafts, never for a published event.
  if (publishing) return { ok: false, path: 'startsAt', message: WHEN_PUBLISH_NEEDS_START };
  if (endInstant) return { ok: false, path: 'endsAt', message: WHEN_END_TIME_NEEDS_START_TIME };
  if (endIsDate && end! <= startsAt) return { ok: false, path: 'endsAt', message: WHEN_END_DATE_BEFORE_START };
  return { ok: true, when: { kind: 'dateOnly', dateStart: startsAt, dateEnd: endIsDate ? end! : null } };
}

/** The four `community_events` columns that describe the "when" (the other kind is always null). */
export interface EventWhenColumns {
  startsAt: string | null;
  endsAt: string | null;
  dateStart: string | null;
  dateEnd: string | null;
}

export function eventWhenColumns(when: EventWhen): EventWhenColumns {
  return when.kind === 'timed'
    ? { startsAt: when.startsAt.toISOString(), endsAt: when.endsAt?.toISOString() ?? null, dateStart: null, dateEnd: null }
    : { startsAt: null, endsAt: null, dateStart: when.dateStart, dateEnd: when.dateEnd };
}

/** End of the last calendar day of a date-only event (the generated `effective_ends_at`, same rule as the database). */
export function dateOnlyEffectiveEnd(dateStart: string, dateEnd: string | null): Date {
  return israelEndOfDate(dateEnd ?? dateStart);
}
