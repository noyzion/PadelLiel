'use server';

import { revalidatePath } from 'next/cache';
import { AppError } from '@/lib/domain/errors';
import type { CancelResult } from '@/lib/domain/types';
import {
  bookSessionSchema,
  cancelBookingSchema,
  entryIdSchema,
  profileUpdateSchema,
  sessionIdSchema,
} from '@/lib/validation/schemas';
import { actionContext } from '@/server/auth';
import { parseInput, runAction, type ActionResult } from '@/server/action';
import { unwrap } from '@/server/rpc';
import { bookSession, cancelBooking, joinWaitlist, leaveWaitlist } from '@/server/services/booking';

function refresh() {
  revalidatePath('/', 'layout');
}

/** Books a session. Eligibility, allowance, capacity and the late-policy acknowledgement are enforced by the database. */
export async function bookSessionAction(input: { sessionId: string; ackLatePolicy?: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const { sessionId, ackLatePolicy } = parseInput(bookSessionSchema, input);
    const { db } = await actionContext('member');
    await bookSession(db, sessionId, ackLatePolicy);
    refresh();
  });
}

/** Cancels a booking. The database decides early vs late; a late cancel requires `confirmLate`. */
export async function cancelBookingAction(input: { bookingId: string; confirmLate?: boolean }): Promise<ActionResult<CancelResult>> {
  return runAction(async () => {
    const { bookingId, confirmLate } = parseInput(cancelBookingSchema, input);
    const { db } = await actionContext('member');
    const result = await cancelBooking(db, bookingId, confirmLate);
    refresh();
    return result;
  });
}

export async function joinWaitlistAction(input: { sessionId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { sessionId } = parseInput(sessionIdSchema, input);
    const { db } = await actionContext('member');
    await joinWaitlist(db, sessionId);
    refresh();
  });
}

export async function leaveWaitlistAction(input: { entryId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { entryId } = parseInput(entryIdSchema, input);
    const { db } = await actionContext('member');
    await leaveWaitlist(db, entryId);
    refresh();
  });
}

/**
 * Trainees may only change their own name and contact phone (column-level grant + RLS enforce this in the database).
 * An account without an e-mail address signs in with its phone number, so that number is left alone here: changing the
 * contact number only would make it silently differ from the login.
 */
export async function updateProfileAction(input: { fullName: string; phone?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { fullName, phone } = parseInput(profileUpdateSchema, input);
    const { db, userId, profile } = await actionContext('member');
    const changes = profile.email && phone ? { full_name: fullName, phone } : { full_name: fullName };
    const rows = unwrap(await db.from('profiles').update(changes).eq('id', userId).select('id')) as { id: string }[];
    if (rows.length !== 1) throw new AppError('NOT_AUTHORIZED');
    refresh();
  });
}
