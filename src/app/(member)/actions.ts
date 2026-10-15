'use server';

import { revalidatePath } from 'next/cache';
import { AppError } from '@/lib/domain/errors';
import type { CancelResult } from '@/lib/domain/types';
import {
  bookSessionSchema,
  cancelBookingSchema,
  changePasswordSchema,
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
 * A signed-in trainee sets her own password. This is also the last step of a coach reset: the temporary password
 * she was given is the "current" one here. The current password is checked first, so a phone left unlocked is not
 * enough to take over the account. Other devices are signed out afterwards.
 */
export async function changePasswordAction(input: { currentPassword: string; newPassword: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { currentPassword, newPassword } = parseInput(changePasswordSchema, input);
    const { db } = await actionContext('member');

    // The identity comes from the auth server (not from the form), so only her own login can be verified.
    const { data: auth } = await db.auth.getUser();
    const user = auth.user;
    if (!user) throw new AppError('NOT_AUTHENTICATED');
    const credentials = user.phone
      ? { phone: user.phone, password: currentPassword }
      : user.email
        ? { email: user.email, password: currentPassword }
        : null;
    if (!credentials) throw new AppError('INTERNAL');

    const verified = await db.auth.signInWithPassword(credentials);
    if (verified.error) {
      if (verified.error.status === 429 || verified.error.code === 'over_request_rate_limit') {
        throw new AppError('INVALID_INPUT', { userMessage: 'בוצעו יותר מדי ניסיונות. נסי שוב בעוד כמה דקות.' });
      }
      throw new AppError('INVALID_INPUT', { userMessage: 'הסיסמה הנוכחית שגויה.' });
    }

    // `current_password` is also required by the project when "Require current password" is switched on.
    const { error } = await db.auth.updateUser({ password: newPassword, current_password: currentPassword });
    if (error) {
      if (error.code === 'weak_password') {
        const leaked = 'reasons' in error && Array.isArray(error.reasons) && error.reasons.includes('pwned');
        throw new AppError('INVALID_INPUT', {
          userMessage: leaked
            ? 'הסיסמה הזו מופיעה ברשימות סיסמאות שדלפו. בחרי סיסמה אחרת.'
            : 'הסיסמה חלשה מדי. בחרי סיסמה ארוכה וייחודית יותר.',
        });
      }
      if (error.code === 'same_password') {
        throw new AppError('INVALID_INPUT', { userMessage: 'הסיסמה החדשה חייבת להיות שונה מהנוכחית.' });
      }
      throw new AppError('INTERNAL', { cause: error });
    }

    // Anyone else still signed in with the old password (another phone, or someone who found it) is signed out.
    await db.auth.signOut({ scope: 'others' });
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
