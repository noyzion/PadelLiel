import type { EventStatus, EventView } from '@/lib/domain/events';
import { israelEndOfDay, israelLocalToInstant } from '@/lib/time';
import { eventFormSchema } from '@/lib/validation/schemas';

export interface EventPreviewInput {
  title: string;
  description: string;
  /** `datetime-local` values in Israel time, exactly as typed in the form. */
  startsAt: string;
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
  const starts = israelLocalToInstant(data.startsAt)!;
  const ends = data.endsAt ? israelLocalToInstant(data.endsAt)! : null;
  const startsAt = starts.toISOString();

  return {
    ok: true,
    event: {
      id: PREVIEW_EVENT_ID,
      title: data.title,
      description: data.description,
      cover_image: null,
      image_url: imageUrl,
      starts_at: startsAt,
      ends_at: ends ? ends.toISOString() : null,
      location: data.location,
      status: data.status,
      created_by: null,
      created_at: startsAt,
      updated_at: startsAt,
      // Same rule as the database's generated column.
      effective_ends_at: (ends ?? israelEndOfDay(startsAt)).toISOString(),
    },
  };
}
