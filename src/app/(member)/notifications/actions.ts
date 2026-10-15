'use server';

import { revalidatePath } from 'next/cache';
import {
  notificationIdSchema,
  preferencesPatchSchema,
  pushEndpointSchema,
  pushSubscriptionSchema,
} from '@/lib/validation/notification-schemas';
import { actionContext } from '@/server/auth';
import { parseInput, runAction, type ActionResult } from '@/server/action';
import {
  deletePushSubscription,
  getUnreadCount,
  markAllRead,
  markRead,
  savePreferences,
  savePushSubscription,
} from '@/server/services/notifications';

/** Server actions for the trainee's notification center. Trainees only; everything is scoped to the caller by the database. */

export async function markNotificationReadAction(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(notificationIdSchema, input);
    const { db } = await actionContext('member');
    await markRead(db, id);
    revalidatePath('/notifications');
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<number>> {
  return runAction(async () => {
    const { db } = await actionContext('member');
    const count = await markAllRead(db);
    revalidatePath('/notifications');
    return count;
  });
}

/** Polled by the bell (focus / every minute / when a Push arrives). */
export async function getUnreadCountAction(): Promise<ActionResult<number>> {
  return runAction(async () => {
    const { db } = await actionContext('member');
    return getUnreadCount(db);
  });
}

export async function savePreferencesAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const patch = parseInput(preferencesPatchSchema, input);
    const { db } = await actionContext('member');
    await savePreferences(db, patch);
    revalidatePath('/profile');
  });
}

export async function savePushSubscriptionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const sub = parseInput(pushSubscriptionSchema, input);
    const { db } = await actionContext('member');
    await savePushSubscription(db, sub);
    revalidatePath('/profile');
  });
}

export async function deletePushSubscriptionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { endpoint } = parseInput(pushEndpointSchema, input);
    const { db } = await actionContext('member');
    await deletePushSubscription(db, endpoint);
    revalidatePath('/profile');
  });
}
