import { z } from 'zod';
import { EVENT_DESCRIPTION_MAX, EVENT_LOCATION_MAX, EVENT_TITLE_MAX, type EventStatus } from '@/lib/domain/events';
import { isValidDateString, israelDateOf } from '@/lib/time';

/**
 * Import of the annual community calendar (data/padelliel_annual_events_2026_2027.json) into the existing
 * `community_events` module. Pure: no database, no I/O. The server service (`src/server/services/event-import.ts`)
 * reads existing events and writes the rows this module plans.
 *
 * Rules (all enforced here and again by the database):
 *   - every imported event is a DRAFT; nothing is published automatically;
 *   - dates are copied verbatim; no start/end time and no cover image is ever invented (the source has none);
 *   - the import only ever CREATES rows. A row that already exists (same import key, or the same title on the
 *     same date) is skipped and never modified, so staff edits survive every re-run.
 */

export const IMPORT_TIME_ZONE = 'Asia/Jerusalem';

/** Stable key format; the database enforces the same pattern (community_events_import_key_format). */
const IMPORT_KEY = /^[a-z0-9][a-z0-9-]{2,79}$/;

const withLength = (min: number, max: number) => (v: string) => v.trim().length >= min && v.length <= max;

const sourceEvent = z
  .object({
    import_key: z.string().regex(IMPORT_KEY, 'import_key לא תקין'),
    title: z.string().refine(withLength(2, EVENT_TITLE_MAX), 'כותרת לא תקינה'),
    subtitle: z.string().nullable().optional(),
    description: z.string().refine(withLength(1, EVENT_DESCRIPTION_MAX), 'תיאור לא תקין'),
    date_start: z.string().refine(isValidDateString, 'date_start לא תקין'),
    date_end: z.string().refine(isValidDateString, 'date_end לא תקין'),
    // The flyer has no clock times and no images. Anything else is refused rather than guessed at or ignored.
    start_time: z.null({ error: 'start_time must be null: the flyer has no times' }),
    end_time: z.null({ error: 'end_time must be null: the flyer has no times' }),
    location: z.string().refine(withLength(1, EVENT_LOCATION_MAX), 'מיקום לא תקין'),
    status: z.literal('DRAFT', { error: 'status must be DRAFT: nothing is imported as published' }),
    cover_image: z.null({ error: 'cover_image must be null: the flyer has no images' }),
  })
  .refine((v) => v.date_end >= v.date_start, { message: 'date_end לפני date_start', path: ['date_end'] });

const sourceFile = z.object({
  timezone: z.literal(IMPORT_TIME_ZONE),
  events: z.array(sourceEvent).min(1, 'אין אירועים בקובץ'),
});

export type AnnualEventSource = z.infer<typeof sourceEvent>;

export type ParsedSource = { ok: true; events: AnnualEventSource[] } | { ok: false; errors: string[] };

/** Validates the raw JSON. Collects every problem so a bad file is reported in one go. */
export function parseAnnualEvents(raw: unknown): ParsedSource {
  const parsed = sourceFile.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const e of parsed.data.events) {
    if (seen.has(e.import_key)) errors.push(`import_key כפול: ${e.import_key}`);
    seen.add(e.import_key);
  }
  return errors.length ? { ok: false, errors } : { ok: true, events: parsed.data.events };
}

/* ------------------------------ planning ------------------------------ */

export interface PlannedEvent {
  importKey: string;
  title: string;
  description: string;
  location: string;
  status: 'DRAFT';
  /** Israel calendar date of the (first) day. */
  dateStart: string;
  /** Last day of a multi-day event; null for a single-day event. */
  dateEnd: string | null;
  span: 'SINGLE_DAY' | 'MULTI_DAY';
}

/** One planned event per source event, in the source order. Strings are copied verbatim. */
export function planAnnualEvents(events: readonly AnnualEventSource[]): PlannedEvent[] {
  return events.map((e) => {
    const multi = e.date_end > e.date_start;
    return {
      importKey: e.import_key,
      title: e.title,
      description: e.description,
      location: e.location,
      status: 'DRAFT',
      dateStart: e.date_start,
      dateEnd: multi ? e.date_end : null,
      span: multi ? 'MULTI_DAY' : 'SINGLE_DAY',
    };
  });
}

/**
 * The columns inserted for a planned event, and nothing else: no `starts_at` / `ends_at` (no time was
 * provided), no `cover_image`, always DRAFT. The date is stored as a date-only draft.
 */
export function toInsertRow(p: PlannedEvent) {
  return {
    import_key: p.importKey,
    title: p.title,
    description: p.description,
    location: p.location,
    status: 'DRAFT' as const,
    date_start: p.dateStart,
    date_end: p.dateEnd,
  };
}

/* ------------------------------ matching ------------------------------ */

/** The part of an existing event needed to recognise a duplicate. */
export interface ExistingEventRef {
  id: string;
  import_key: string | null;
  title: string;
  status: EventStatus;
  starts_at: string | null;
  date_start: string | null;
}

export type ImportAction =
  /** No match: a new draft will be created. */
  | 'CREATE'
  /** An event with this import key already exists: left exactly as it is (staff edits are kept). */
  | 'SKIP_SAME_KEY'
  /** An event with the same title on the same date exists (e.g. created by hand): skipped, never overwritten. */
  | 'SKIP_SIMILAR';

export interface PlanRow {
  event: PlannedEvent;
  action: ImportAction;
  match: ExistingEventRef | null;
}

export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The Israel calendar date an existing event starts on (a timed event, or a date-only draft). */
function existingStartDate(e: ExistingEventRef): string | null {
  if (e.starts_at) return israelDateOf(e.starts_at);
  return e.date_start;
}

/** Decides, for every planned event, whether it is created or skipped. Never decides to modify anything. */
export function matchPlan(planned: readonly PlannedEvent[], existing: readonly ExistingEventRef[]): PlanRow[] {
  const byKey = new Map(existing.filter((e) => e.import_key).map((e) => [e.import_key as string, e]));
  return planned.map((event) => {
    const sameKey = byKey.get(event.importKey);
    if (sameKey) return { event, action: 'SKIP_SAME_KEY', match: sameKey };

    const title = normalizeTitle(event.title);
    const similar = existing.find((e) => normalizeTitle(e.title) === title && existingStartDate(e) === event.dateStart);
    if (similar) return { event, action: 'SKIP_SIMILAR', match: similar };

    return { event, action: 'CREATE', match: null };
  });
}

export interface PlanSummary {
  total: number;
  create: number;
  skipSameKey: number;
  skipSimilar: number;
  singleDay: number;
  multiDay: number;
}

export function summarizePlan(rows: readonly PlanRow[]): PlanSummary {
  return {
    total: rows.length,
    create: rows.filter((r) => r.action === 'CREATE').length,
    skipSameKey: rows.filter((r) => r.action === 'SKIP_SAME_KEY').length,
    skipSimilar: rows.filter((r) => r.action === 'SKIP_SIMILAR').length,
    singleDay: rows.filter((r) => r.event.span === 'SINGLE_DAY').length,
    multiDay: rows.filter((r) => r.event.span === 'MULTI_DAY').length,
  };
}

export const IMPORT_ACTION_LABEL_HE: Record<ImportAction, string> = {
  CREATE: 'ייווצר כטיוטה',
  SKIP_SAME_KEY: 'כבר יובא. לא ישתנה',
  SKIP_SIMILAR: 'דומה לאירוע קיים. ידולג',
};

/** The phrase an admin must type to confirm writing to the database. */
export const IMPORT_CONFIRM_PHRASE = 'ייבוא';
