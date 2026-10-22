import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Db } from '@/lib/supabase/server';
import { AppError, toAppError } from '@/lib/domain/errors';
import { EVENT_RSVP_WINDOW_MS, type EventRsvpStatus } from '@/lib/domain/event-rsvp';
import { WHEN_PUBLISH_NEEDS_DATE } from '@/lib/domain/event-when';
import {
  EVENT_IMAGE_BUCKET,
  eventAnchor,
  EVENT_IMAGE_EXTENSIONS,
  type CommunityEvent,
  type EventImageType,
  type EventStatus,
  type EventView,
} from '@/lib/domain/events';
import { currentMonthStart, israelLocalToInstant, shiftMonth } from '@/lib/time';
import { rpc, unwrap } from '../rpc';

/**
 * Community events: a noticeboard plus optional attendance confirmation.
 * Independent of training sessions — an RSVP never touches quota.
 * Visibility is enforced by Row Level Security (trainees only ever see PUBLISHED events);
 * the status filters below only make the intent explicit.
 */

function toView(db: Db, event: CommunityEvent): EventView {
  return {
    ...event,
    image_url: event.cover_image ? db.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(event.cover_image).data.publicUrl : null,
  };
}

/* ------------------------------ trainee reads ------------------------------ */

/** The Israel calendar month containing `now`, as a half-open instant range [from, to). */
export function currentMonthRange(now: Date): { from: Date; to: Date } {
  const monthStart = currentMonthStart(now);
  return {
    from: israelLocalToInstant(`${monthStart}T00:00`)!,
    to: israelLocalToInstant(`${shiftMonth(monthStart, 1)}T00:00`)!,
  };
}

/**
 * Published events that have not ended yet, nearest first.
 * With `range`, only events that start before the range ends (i.e. are part of that month).
 */
export async function listUpcomingEvents(db: Db, now: Date, range?: { from: Date; to: Date }): Promise<EventView[]> {
  let query = db
    .from('community_events')
    .select('*')
    .eq('status', 'PUBLISHED')
    .gt('effective_ends_at', now.toISOString());
  // effective_starts_at = the start time, or the start of the first day for an event with a date but no time.
  if (range) query = query.lt('effective_starts_at', range.to.toISOString());
  const rows = unwrap(await query.order('effective_starts_at', { ascending: true }).order('id')) as CommunityEvent[];
  return rows.map((e) => toView(db, e));
}

/**
 * Published events that already ended, newest first. They are never deleted automatically.
 * With `range`, only events that ended within that month.
 */
export async function listPastEvents(
  db: Db,
  now: Date,
  limit = 60,
  range?: { from: Date; to: Date },
): Promise<EventView[]> {
  let query = db
    .from('community_events')
    .select('*')
    .eq('status', 'PUBLISHED')
    .lte('effective_ends_at', now.toISOString());
  if (range) query = query.gte('effective_ends_at', range.from.toISOString());
  const rows = unwrap(
    await query.order('effective_starts_at', { ascending: false }).order('id').limit(limit),
  ) as CommunityEvent[];
  return rows.map((e) => toView(db, e));
}

/** A single published event (null when missing, a draft, or not visible to the caller). */
export async function getPublishedEvent(db: Db, id: string): Promise<EventView | null> {
  const row = unwrap(
    await db.from('community_events').select('*').eq('id', id).eq('status', 'PUBLISHED').maybeSingle(),
  ) as CommunityEvent | null;
  return row ? toView(db, row) : null;
}

/* ------------------------------ admin reads ------------------------------ */

export async function listAllEvents(db: Db): Promise<EventView[]> {
  const rows = unwrap(await db.from('community_events').select('*').order('id')) as CommunityEvent[];
  // Newest first. Date-only drafts have no starts_at, so they are placed by their date (sorted here, not in SQL).
  return rows
    .sort((a, b) => eventAnchor(b).localeCompare(eventAnchor(a)) || a.id.localeCompare(b.id))
    .map((e) => toView(db, e));
}

export async function getEvent(db: Db, id: string): Promise<EventView | null> {
  const row = unwrap(await db.from('community_events').select('*').eq('id', id).maybeSingle()) as CommunityEvent | null;
  return row ? toView(db, row) : null;
}

/* ------------------------------ admin writes ------------------------------ */

export interface EventInput {
  title: string;
  description: string;
  /**
   * The "when", from `eventWhenColumns`: ISO instants (timed), calendar dates (a date or range with no
   * clock time), or all null (undated draft). The unused columns are null; the database enforces it.
   */
  startsAt: string | null;
  endsAt: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  location: string;
  status: EventStatus;
}

export interface ImageUpload {
  bytes: Uint8Array;
  type: EventImageType;
}

function columns(input: EventInput) {
  return {
    title: input.title,
    description: input.description,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    date_start: input.dateStart,
    date_end: input.dateEnd,
    location: input.location,
    status: input.status,
  };
}

async function uploadImage(db: Db, eventId: string, image: ImageUpload): Promise<string> {
  const path = `${eventId}/${randomUUID()}.${EVENT_IMAGE_EXTENSIONS[image.type]}`;
  const { error } = await db.storage.from(EVENT_IMAGE_BUCKET).upload(path, image.bytes, {
    contentType: image.type,
    // The path is unique per upload, so the object never changes: cache it for a year.
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    throw new AppError('INTERNAL', { cause: error, userMessage: 'העלאת התמונה נכשלה. נסי שוב.' });
  }
  return path;
}

/** Best effort: an orphaned file is harmless, so a failure here must not fail the user's action. */
async function removeImage(db: Db, path: string | null | undefined) {
  if (!path) return;
  const { error } = await db.storage.from(EVENT_IMAGE_BUCKET).remove([path]);
  if (error) console.error('[events] could not remove image', path, error);
}

export async function createEvent(db: Db, input: EventInput, image: ImageUpload | null): Promise<string> {
  // The id is chosen up front so the image can be stored under the event's own folder.
  const id = randomUUID();
  const path = image ? await uploadImage(db, id, image) : null;

  const { error } = await db
    .from('community_events')
    .insert({ id, ...columns(input), cover_image: path })
    .select('id')
    .single();
  if (error) {
    await removeImage(db, path);
    throw toAppError(error);
  }
  return id;
}

export async function updateEvent(
  db: Db,
  id: string,
  input: EventInput,
  image: ImageUpload | null,
  dropImage: boolean,
): Promise<void> {
  const existing = await getEvent(db, id);
  if (!existing) throw new AppError('EVENT_NOT_FOUND');

  const uploaded = image ? await uploadImage(db, id, image) : null;
  const coverImage = uploaded ?? (dropImage ? null : existing.cover_image);

  const { data, error } = await db
    .from('community_events')
    .update({ ...columns(input), cover_image: coverImage })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    await removeImage(db, uploaded);
    if (error) throw toAppError(error);
    throw new AppError('EVENT_NOT_FOUND');
  }

  if (existing.cover_image && existing.cover_image !== coverImage) await removeImage(db, existing.cover_image);
}

/** Publishes or unpublishes without touching any other field. Unpublished events vanish from trainees at once. */
export async function setEventStatus(db: Db, id: string, status: EventStatus): Promise<void> {
  const existing = await getEvent(db, id);
  if (!existing) throw new AppError('EVENT_NOT_FOUND');
  if (status === 'PUBLISHED' && !existing.description.trim()) {
    throw new AppError('INVALID_INPUT', { userMessage: 'כדי לפרסם אירוע יש להוסיף תיאור' });
  }
  // An event needs a date to be published (a time is optional); the database refuses it too.
  if (status === 'PUBLISHED' && !existing.starts_at && !existing.date_start) {
    throw new AppError('INVALID_INPUT', { userMessage: WHEN_PUBLISH_NEEDS_DATE });
  }
  const { data, error } = await db.from('community_events').update({ status }).eq('id', id).select('id').maybeSingle();
  if (error) throw toAppError(error);
  if (!data) throw new AppError('EVENT_NOT_FOUND');
}

export async function deleteEvent(db: Db, id: string): Promise<void> {
  const deleted = unwrap(
    await db.from('community_events').delete().eq('id', id).select('cover_image'),
  ) as { cover_image: string | null }[];
  if (deleted.length === 0) throw new AppError('EVENT_NOT_FOUND');
  await removeImage(db, deleted[0].cover_image);
}

/* ------------------------------ RSVP ------------------------------ */

export async function getMyEventRsvp(db: Db, eventId: string): Promise<EventRsvpStatus | null> {
  const row = unwrap(
    await db.from('event_rsvps').select('status').eq('event_id', eventId).maybeSingle(),
  ) as { status: EventRsvpStatus } | null;
  return row?.status ?? null;
}

export async function getMyEventRsvps(db: Db, eventIds: string[]): Promise<Map<string, EventRsvpStatus>> {
  const map = new Map<string, EventRsvpStatus>();
  if (eventIds.length === 0) return map;
  const rows = unwrap(await db.from('event_rsvps').select('event_id, status').in('event_id', eventIds)) as {
    event_id: string;
    status: EventRsvpStatus;
  }[];
  for (const row of rows ?? []) map.set(row.event_id, row.status);
  return map;
}

/** Soonest published event in the next 24 hours that this trainee has not answered yet. */
export async function getEventRsvpPrompt(db: Db, now: Date): Promise<EventView | null> {
  const until = new Date(now.getTime() + EVENT_RSVP_WINDOW_MS).toISOString();
  const events = (unwrap(
    await db
      .from('community_events')
      .select('*')
      .eq('status', 'PUBLISHED')
      .gt('effective_ends_at', now.toISOString())
      .lte('effective_starts_at', until)
      .order('effective_starts_at', { ascending: true })
      .order('id')
      .limit(20),
  ) ?? []) as CommunityEvent[];
  if (events.length === 0) return null;
  const answered = await getMyEventRsvps(
    db,
    events.map((e) => e.id),
  );
  const pending = events.find((e) => !answered.has(e.id));
  return pending ? toView(db, pending) : null;
}

export function setEventRsvp(db: Db, eventId: string, status: EventRsvpStatus) {
  return rpc<EventRsvpStatus>(db, 'set_event_rsvp', { p_event_id: eventId, p_status: status });
}

export interface EventRsvpRow {
  member_id: string;
  full_name: string;
  phone: string | null;
  status: EventRsvpStatus;
  updated_at: string;
}

export async function listEventRsvps(db: Db, eventId: string): Promise<EventRsvpRow[]> {
  return (await rpc<EventRsvpRow[] | null>(db, 'admin_list_event_rsvps', { p_event_id: eventId })) ?? [];
}
