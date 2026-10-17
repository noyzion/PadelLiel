import { safeNext } from '@/lib/safe-redirect';
import type { NotificationType } from './types';

/**
 * Pure helpers shared by the dispatcher, the service worker contract and the UI.
 * Every rule about WHEN and WHAT to notify lives in the database (migration 20261016000016); nothing here
 * decides business behaviour.
 */

/** Where a notification may send the user: a path inside this app, never another site. */
export function safeDestination(url: unknown): string {
  return safeNext(url, '/notifications');
}

/** Link target for a stored notification, or null when it has no destination. */
export function notificationHref(url: string | null): string | null {
  return url ? safeDestination(url) : null;
}

/**
 * How long the push service may hold an undelivered message. A reminder that arrives after the moment it
 * is about is worse than none, so the time-critical ones expire quickly.
 */
export function pushTtlSeconds(type: string): number {
  switch (type as NotificationType) {
    case 'cancellation_deadline':
      return 30 * 60;
    case 'training_reminder':
      return 2 * 60 * 60;
    default:
      return 24 * 60 * 60;
  }
}

export interface PushJobForPayload {
  notification_id: string;
  title: string;
  message: string;
  url: string;
}

/** What the service worker receives. Deliberately minimal: no names, no ids other than the notification's. */
export interface PushPayload {
  id: string;
  title: string;
  body: string;
  url: string;
}

export function buildPushPayload(job: PushJobForPayload): PushPayload {
  return { id: job.notification_id, title: job.title, body: job.message, url: safeDestination(job.url) };
}

export type PushFailureKind = 'gone' | 'permanent' | 'retry';

/**
 * Classifies a failed Web Push request:
 *   gone      the subscription is dead or belongs to another VAPID key (404, 410, 403) -> delete it
 *   permanent the message itself was rejected (400, 413) -> retrying cannot help
 *   retry     everything else (429, 5xx, 401 = our own configuration, network errors)
 */
export function classifyPushFailure(statusCode: number | undefined): PushFailureKind {
  if (statusCode === 404 || statusCode === 410 || statusCode === 403) return 'gone';
  if (statusCode === 400 || statusCode === 413) return 'permanent';
  return 'retry';
}

export const NOTIFICATION_TYPE_LABELS_HE: Record<NotificationType, string> = {
  booking_confirmed: 'הרשמה',
  training_reminder: 'תזכורת',
  cancellation_deadline: 'תזכורת ביטול',
  session_cancelled: 'ביטול אימון',
  schedule_published: 'לוח אימונים',
  staff_member_pending: 'ממתינה לאישור',
  staff_booking_created: 'הרשמה חדשה',
  staff_booking_cancelled: 'ביטול הרשמה',
  staff_waitlist_joined: 'רשימת המתנה',
};
