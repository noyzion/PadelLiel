import { VENUE_NAME } from '@/lib/brand';
import { formatEventDatesHe, formatEventWhenHe, israelNoonOf } from '@/lib/time';

/**
 * Community events: an informational noticeboard. Nothing here knows about sessions, bookings,
 * plans or allowances, and nothing may ever be added that does (no registration, RSVP, capacity, ...).
 */

export type EventStatus = 'DRAFT' | 'PUBLISHED';

/** A row of `community_events`. */
export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  /** Storage object path inside the `event-images` bucket, or null. */
  cover_image: string | null;
  /** Start instant. Null only for a date-only DRAFT (see `date_start`); a published event always has one. */
  starts_at: string | null;
  ends_at: string | null;
  /** Israel calendar date of a DRAFT whose clock time is not known yet (null when `starts_at` is set). */
  date_start: string | null;
  /** Last calendar date of a multi-day date-only DRAFT (null for a single day). */
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

/** Whether the event only has a date (no clock time yet). Only drafts can be like this. */
export function isDateOnlyEvent(event: Pick<CommunityEvent, 'starts_at' | 'date_start'>): boolean {
  return event.starts_at === null && event.date_start !== null;
}

/** The "when" of an event for display: date (or date range) and, when known, the time. `time` is null for date-only drafts. */
export function eventWhenHe(
  event: Pick<CommunityEvent, 'starts_at' | 'ends_at' | 'date_start' | 'date_end'>,
  compact = false,
): { date: string; time: string | null } {
  if (event.starts_at) return formatEventWhenHe(event.starts_at, event.ends_at, compact);
  return formatEventDatesHe(event.date_start ?? '1970-01-01', event.date_end, compact);
}

/** An instant on the event's first day: for ordering and for showing the day number. */
export function eventAnchor(event: Pick<CommunityEvent, 'starts_at' | 'date_start'>): string {
  if (event.starts_at) return event.starts_at;
  return israelNoonOf(event.date_start ?? '1970-01-01').toISOString();
}
