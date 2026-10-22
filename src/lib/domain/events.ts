import { VENUE_NAME } from '@/lib/brand';
import { formatEventDatesHe, formatEventWhenHe, israelNoonOf } from '@/lib/time';

/**
 * Community events: a noticeboard plus optional attendance confirmation (`event_rsvps`).
 * Nothing here knows about sessions, bookings, plans or allowances — an RSVP never touches quota.
 */

export type EventStatus = 'DRAFT' | 'PUBLISHED';

/** A row of `community_events`. */
export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  /** Storage object path inside the `event-images` bucket, or null. */
  cover_image: string | null;
  /** Start instant. Null when only a date is known (see `date_start`) or when there is no date yet (a draft). */
  starts_at: string | null;
  ends_at: string | null;
  /** Israel calendar date of an event whose clock time is not known (null when `starts_at` is set). */
  date_start: string | null;
  /** Last calendar date of a multi-day event without a clock time (null for a single day). */
  date_end: string | null;
  location: string;
  status: EventStatus;
  /** Stable key of the annual-calendar import (null for events created by hand). Set once, never changed. */
  import_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** End of the event (or end of its last Israel calendar day when it has no end time). Generated column. */
  effective_ends_at: string | null;
  /** The start time, or the start of the first day when there is no time. Sort / month-filter key. Generated column. */
  effective_starts_at: string | null;
}

/** An event plus the public URL of its cover image (resolved by the server). */
export interface EventView extends CommunityEvent {
  image_url: string | null;
}

export const EVENT_STATUS_LABEL_HE: Record<EventStatus, string> = {
  DRAFT: 'טיוטה',
  PUBLISHED: 'פורסם',
};

export const DEFAULT_EVENT_LOCATION = VENUE_NAME;

export const EVENT_TITLE_MAX = 120;
export const EVENT_DESCRIPTION_MAX = 5000;
export const EVENT_LOCATION_MAX = 160;

/* ------------------------------ images ------------------------------ */

export const EVENT_IMAGE_BUCKET = 'event-images';
/** Same limit as the bucket's `file_size_limit` (and safely under typical serverless body limits). */
export const EVENT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export const EVENT_IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type EventImageType = keyof typeof EVENT_IMAGE_EXTENSIONS;

/** Value for an `<input type="file" accept>`. */
export const EVENT_IMAGE_ACCEPT = Object.keys(EVENT_IMAGE_EXTENSIONS).join(',');

/** Detects the real image type from the file's first bytes (the declared MIME type is not trusted). */
export function sniffImageType(bytes: Uint8Array): EventImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export type ImageCheck = { ok: true; type: EventImageType } | { ok: false; message: string };

/** Validates an uploaded cover image by size and by its actual content. */
export function checkEventImage(size: number, head: Uint8Array): ImageCheck {
  if (size <= 0) return { ok: false, message: 'קובץ התמונה ריק' };
  if (size > EVENT_IMAGE_MAX_BYTES) {
    return { ok: false, message: `התמונה גדולה מדי (עד ${EVENT_IMAGE_MAX_BYTES / 1024 / 1024} מ״ב)` };
  }
  const type = sniffImageType(head);
  if (!type) return { ok: false, message: 'אפשר להעלות רק תמונות מסוג JPG, PNG או WebP' };
  return { ok: true, type };
}

/* ------------------------------ text ------------------------------ */

/** Splits a description into paragraphs (separated by one or more blank lines). */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Whether the event is over, judged by the generated `effective_ends_at`. Display only. */
export function isEventPast(event: Pick<CommunityEvent, 'effective_ends_at'>, nowMs: number): boolean {
  return event.effective_ends_at !== null && new Date(event.effective_ends_at).getTime() <= nowMs;
}

/** Shown instead of a time for an event that has a date but no time yet. Never replaced by an invented hour. */
export const EVENT_TIME_TBA_HE = 'השעה תפורסם בהמשך';
/** Admin-only: shown for a draft that has no date at all. */
export const EVENT_DATE_TBA_HE = 'טרם נקבע תאריך';

/** Whether the event has a date (or a date range) but no clock time. Draft or published. */
export function isDateOnlyEvent(event: Pick<CommunityEvent, 'starts_at' | 'date_start'>): boolean {
  return event.starts_at === null && event.date_start !== null;
}

/** Whether the event has no date at all. Such an event is always a draft. */
export function isUndatedEvent(event: Pick<CommunityEvent, 'starts_at' | 'date_start'>): boolean {
  return event.starts_at === null && event.date_start === null;
}

/**
 * The "when" of an event for display: date (or date range) and, when known, the time.
 * `time` is null when there is no time; callers show `EVENT_TIME_TBA_HE` for date-only events.
 */
export function eventWhenHe(
  event: Pick<CommunityEvent, 'starts_at' | 'ends_at' | 'date_start' | 'date_end'>,
  compact = false,
): { date: string; time: string | null } {
  if (event.starts_at) return formatEventWhenHe(event.starts_at, event.ends_at, compact);
  if (event.date_start) return formatEventDatesHe(event.date_start, event.date_end, compact);
  return { date: EVENT_DATE_TBA_HE, time: null };
}

/** An instant on the event's first day: for ordering and for showing the day number. Undated events sort last. */
export function eventAnchor(event: Pick<CommunityEvent, 'starts_at' | 'date_start'>): string {
  if (event.starts_at) return event.starts_at;
  if (event.date_start) return israelNoonOf(event.date_start).toISOString();
  return '9999-12-31T00:00:00.000Z';
}
