import 'server-only';
import { cache } from 'react';
import type { Db } from '@/lib/supabase/server';
import { DEFAULT_NOTIFICATION_PREFERENCES, type AppNotification, type NotificationPreferences } from '@/lib/domain/types';
import { rpc, unwrap } from '../rpc';

/**
 * Thin wrappers over the notification tables/functions. Row Level Security guarantees that every query only ever
 * sees the signed-in trainee's own rows; nothing here can create a notification (only the database can).
 */

const NOTIFICATION_COLUMNS = 'id, type, title, message, destination_url, read_at, created_at';
export const NOTIFICATION_PAGE_SIZE = 100;

export async function getNotifications(db: Db, limit = NOTIFICATION_PAGE_SIZE): Promise<AppNotification[]> {
  const rows = unwrap(
    await db.from('notifications').select(NOTIFICATION_COLUMNS).order('created_at', { ascending: false }).order('id').limit(limit),
  );
  return (rows ?? []) as AppNotification[];
}

export const getUnreadCount = cache(async (db: Db): Promise<number> => {
  const { count, error } = await db.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) return 0; // the bell must never break a page
  return count ?? 0;
});

export async function getPreferences(db: Db): Promise<NotificationPreferences> {
  const { data, error } = await db
    .from('notification_preferences')
    .select('push_enabled, training_reminders, cancellation_deadline_reminders, booking_updates, weekly_schedule')
    .maybeSingle();
  // Defaults when nothing is stored yet (or the notifications migration has not been applied): everything on.
  if (error) return DEFAULT_NOTIFICATION_PREFERENCES;
  return (data as NotificationPreferences | null) ?? DEFAULT_NOTIFICATION_PREFERENCES;
}

/** The endpoints of this trainee's registered devices (the keys are not readable through the API). */
export async function getDeviceEndpoints(db: Db): Promise<string[]> {
  const { data, error } = await db.from('push_subscriptions').select('endpoint');
  if (error) return [];
  return ((data ?? []) as { endpoint: string }[]).map((r) => r.endpoint);
}

export async function markRead(db: Db, id: string) {
  await rpc<null>(db, 'mark_notification_read', { p_id: id });
}

export function markAllRead(db: Db) {
  return rpc<number>(db, 'mark_all_notifications_read');
}

export async function savePreferences(
  db: Db,
  patch: { pushEnabled?: boolean; trainingReminders?: boolean; cancellationDeadlineReminders?: boolean; bookingUpdates?: boolean; weeklySchedule?: boolean },
) {
  await rpc<null>(db, 'save_notification_preferences', {
    p_push_enabled: patch.pushEnabled ?? null,
    p_training_reminders: patch.trainingReminders ?? null,
    p_cancellation_deadline_reminders: patch.cancellationDeadlineReminders ?? null,
    p_booking_updates: patch.bookingUpdates ?? null,
    p_weekly_schedule: patch.weeklySchedule ?? null,
  });
}

export async function savePushSubscription(db: Db, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) {
  await rpc<string>(db, 'save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
    p_user_agent: sub.userAgent ?? null,
  });
}

export async function deletePushSubscription(db: Db, endpoint: string) {
  await rpc<null>(db, 'delete_push_subscription', { p_endpoint: endpoint });
}
