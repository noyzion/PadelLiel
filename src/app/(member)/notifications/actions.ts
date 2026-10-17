'use server';

import { revalidatePath } from 'next/cache';
import {
  notificationIdSchema,
  preferencesPatchSchema,
  pushEndpointSchema,
  pushSubscriptionSchema,
} from '@/lib/validation/notification-schemas';
import { AppError } from '@/lib/domain/errors';
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

/** Approved trainee or coach. RLS still scopes every row to the caller. */
async function approvedUser() {
  const ctx = await actionContext('any');
  if (ctx.profile.approval_status !== 'approved') throw new AppError('NOT_AUTHORIZED');
  return ctx;
}

function revalidateNotificationSurfaces() {
  revalidatePath('/notifications');
  revalidatePath('/admin/notifications');
}

export async function markNotificationReadAction(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(notificationIdSchema, input);
    const { db } = await approvedUser();
    await markRead(db, id);
    revalidateNotificationSurfaces();
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<number>> {
  return runAction(async () => {
    const { db } = await approvedUser();
    const count = await markAllRead(db);
    revalidateNotificationSurfaces();
    return count;
  });
}

/** Polled by the bell (focus / every minute / when a Push arrives). */
export async function getUnreadCountAction(): Promise<ActionResult<number>> {
  return runAction(async () => {
    const { db } = await approvedUser();
    return getUnreadCount(db);
  });
}

export async function savePreferencesAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const patch = parseInput(preferencesPatchSchema, input);
    const { db } = await approvedUser();
    await savePreferences(db, patch);
    revalidatePath('/profile');
    revalidatePath('/admin/settings');
  });
}

export async function savePushSubscriptionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const sub = parseInput(pushSubscriptionSchema, input);
    const { db } = await approvedUser();
    await savePushSubscription(db, sub);
    revalidatePath('/profile');
    revalidatePath('/admin/settings');
  });
}

export async function deletePushSubscriptionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { endpoint } = parseInput(pushEndpointSchema, input);
    const { db } = await approvedUser();
    await deletePushSubscription(db, endpoint);
    revalidatePath('/profile');
    revalidatePath('/admin/settings');
  });
}
