import { dateOnlyEffectiveEnd, parseEventWhen } from '@/lib/domain/event-when';
import type { EventStatus, EventView } from '@/lib/domain/events';
import { israelEndOfDay, israelNoonOf } from '@/lib/time';
import { eventFormSchema } from '@/lib/validation/schemas';

export interface EventPreviewInput {
  title: string;
  description: string;
  /**
   * `datetime-local` value in Israel time exactly as typed in the form, or just a date ("2026-11-02")
   * for a draft whose time is not known yet.
   */
  startsAt: string;
  /** Same formats as `startsAt` (a bare date means the last day of a multi-day draft). */
  endsAt: string;
  location: string;
}

export const PREVIEW_EVENT_ID = 'preview';

export type PreviewResult = { ok: true; event: EventView } | { ok: false; message: string };

/**
 * Builds the event the trainees would see from the (possibly unsaved) form values. Pure: nothing is
 * saved, published or sent anywhere. Uses the same validation as saving, so a preview never shows
 * something that could not be stored (e.g. an end before the start).
 */
export function buildPreviewEvent(input: EventPreviewInput, status: EventStatus, imageUrl: string | null): PreviewResult {
  const parsed = eventFormSchema.safeParse({ ...input, status });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'הנתונים שהוזנו אינם תקינים' };

  const data = parsed.data;
  const resolved = parseEventWhen(data.startsAt, data.endsAt, status === 'PUBLISHED');
  if (!resolved.ok) return { ok: false, message: resolved.message };
  const when = resolved.when;

  const base = {
    id: PREVIEW_EVENT_ID,
    title: data.title,
    description: data.description,
    cover_image: null,
    image_url: imageUrl,
    location: data.location,
    status: data.status,
    import_key: null,
    created_by: null,
  };

  if (when.kind === 'dateOnly') {
    const anchor = israelNoonOf(when.dateStart).toISOString();
    return {
      ok: true,
      event: {
        ...base,
        starts_at: null,
        ends_at: null,
        date_start: when.dateStart,
        date_end: when.dateEnd,
        created_at: anchor,
        updated_at: anchor,
        // Same rule as the database's generated column.
        effective_ends_at: dateOnlyEffectiveEnd(when.dateStart, when.dateEnd).toISOString(),
      },
    };
  }

  const startsAt = when.startsAt.toISOString();
  return {
    ok: true,
    event: {
      ...base,
      starts_at: startsAt,
      ends_at: when.endsAt ? when.endsAt.toISOString() : null,
      date_start: null,
      date_end: null,
      created_at: startsAt,
      updated_at: startsAt,
      // Same rule as the database's generated column.
      effective_ends_at: (when.endsAt ?? israelEndOfDay(startsAt)).toISOString(),
    },
  };
}
