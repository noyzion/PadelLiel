'use server';

import { revalidatePath } from 'next/cache';
import { generateWeekSessions } from '@/lib/domain/schedule-generator';
import {
  adjustAllowanceSchema,
  assignBookingSchema,
  assignSubscriptionSchema,
  bulkCreateSchema,
  cancelSessionSchema,
  duplicateWeekSchema,
  entryIdSchema,
  memberIdSchema,
  planSchema,
  publishSessionsSchema,
  restoreAllowanceSchema,
  sessionFormSchema,
  sessionIdSchema,
  setBookingStatusSchema,
  settingsSchema,
  subscriptionActiveSchema,
  subscriptionValiditySchema,
  updateMemberSchema,
  updateSessionSchema,
} from '@/lib/validation/schemas';
import { actionContext } from '@/server/auth';
import { parseInput, runAction, type ActionResult } from '@/server/action';
import { adjustAllowance, assignBooking, promoteWaitlistEntry, removeWaitlistEntry, restoreAllowance, setBookingStatus } from '@/server/services/admin-bookings';
import {
  assignSubscription,
  deleteMember,
  resetMemberPassword,
  setSubscriptionActive,
  setSubscriptionValidity,
  updateMember,
} from '@/server/services/admin-members';
import { savePlan } from '@/server/services/admin-plans';
import {
  cancelSession,
  completeSession,
  createSession,
  createSessions,
  deleteDraftSession,
  duplicateWeek,
  publishSessions,
  setRegistrationOpen,
  updateSession,
} from '@/server/services/admin-sessions';
import { updateSettings } from '@/server/services/settings';

function refresh() {
  revalidatePath('/', 'layout');
}

// Every action re-checks the caller is an approved admin. The database enforces it again (RLS + RPC checks).

/* ------------------------------ sessions ------------------------------ */

export async function createSessionsBulkAction(input: unknown): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    const data = parseInput(bulkCreateSchema, input);
    const { db } = await actionContext('admin');
    const rows = generateWeekSessions(data);
    const created = await createSessions(db, rows);
    refresh();
    return { created };
  });
}

export async function createSessionAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const form = parseInput(sessionFormSchema, input);
    const { db } = await actionContext('admin');
    const id = await createSession(db, form);
    refresh();
    return { id };
  });
}

export async function updateSessionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { sessionId, form } = parseInput(updateSessionSchema, input);
    const { db } = await actionContext('admin');
    await updateSession(db, sessionId, form);
    refresh();
  });
}

export async function publishSessionsAction(input: unknown): Promise<ActionResult<{ published: number }>> {
  return runAction(async () => {
    const { sessionIds } = parseInput(publishSessionsSchema, input);
    const { db } = await actionContext('admin');
    const published = await publishSessions(db, sessionIds);
    refresh();
    return { published };
  });
}

export async function cancelSessionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { sessionId, reason } = parseInput(cancelSessionSchema, input);
    const { db } = await actionContext('admin');
    await cancelSession(db, sessionId, reason);
    refresh();
  });
}

export async function completeSessionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { sessionId } = parseInput(sessionIdSchema, input);
    const { db } = await actionContext('admin');
    await completeSession(db, sessionId);
    refresh();
  });
}

export async function deleteDraftSessionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { sessionId } = parseInput(sessionIdSchema, input);
    const { db } = await actionContext('admin');
    await deleteDraftSession(db, sessionId);
    refresh();
  });
}

export async function duplicateWeekAction(input: unknown): Promise<ActionResult<{ created: number }>> {
  return runAction(async () => {
    const { fromWeek, toWeek } = parseInput(duplicateWeekSchema, input);
    const { db } = await actionContext('admin');
    const created = await duplicateWeek(db, fromWeek, toWeek);
    refresh();
    return { created };
  });
}

export async function setRegistrationOpenAction(input: { sessionId: string; open: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const { sessionId } = parseInput(sessionIdSchema, { sessionId: input.sessionId });
    const { db } = await actionContext('admin');
    await setRegistrationOpen(db, sessionId, Boolean(input.open));
    refresh();
  });
}

/* ------------------------------ bookings ------------------------------ */

export async function assignBookingAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(assignBookingSchema, input);
    const { db } = await actionContext('admin');
    await assignBooking(db, data);
    refresh();
  });
}

export async function setBookingStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { bookingId, status, note } = parseInput(setBookingStatusSchema, input);
    const { db } = await actionContext('admin');
    await setBookingStatus(db, bookingId, status, note);
    refresh();
  });
}

export async function restoreAllowanceAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { bookingId, reason } = parseInput(restoreAllowanceSchema, input);
    const { db } = await actionContext('admin');
    await restoreAllowance(db, bookingId, reason);
    refresh();
  });
}

export async function adjustAllowanceAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(adjustAllowanceSchema, input);
    const { db } = await actionContext('admin');
    await adjustAllowance(db, data);
    refresh();
  });
}

export async function promoteWaitlistAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { entryId } = parseInput(entryIdSchema, input);
    const { db } = await actionContext('admin');
    await promoteWaitlistEntry(db, entryId);
    refresh();
  });
}

export async function removeWaitlistAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { entryId } = parseInput(entryIdSchema, input);
    const { db } = await actionContext('admin');
    await removeWaitlistEntry(db, entryId);
    refresh();
  });
}

/* ------------------------------ members ------------------------------ */

export async function updateMemberAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { memberId, patch } = parseInput(updateMemberSchema, input);
    const { db } = await actionContext('admin');
    await updateMember(db, memberId, patch);
    refresh();
    // The trainee is sitting on /pending on another device; expire that page so her next load is not stale.
    revalidatePath('/pending');
    revalidatePath('/');
  });
}

export async function deleteMemberAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { memberId } = parseInput(memberIdSchema, input);
    const { db } = await actionContext('admin');
    await deleteMember(db, memberId);
    refresh();
  });
}

/** Returns the temporary password once, for the coach to hand over in person or on a call. Never revalidates or logs it. */
export async function resetMemberPasswordAction(input: unknown): Promise<ActionResult<{ password: string }>> {
  return runAction(async () => {
    const { memberId } = parseInput(memberIdSchema, input);
    const { db } = await actionContext('admin');
    return { password: await resetMemberPassword(db, memberId) };
  });
}

export async function assignSubscriptionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(assignSubscriptionSchema, input);
    const { db } = await actionContext('admin');
    await assignSubscription(db, data);
    refresh();
  });
}

export async function setSubscriptionActiveAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { subscriptionId, active } = parseInput(subscriptionActiveSchema, input);
    const { db } = await actionContext('admin');
    await setSubscriptionActive(db, subscriptionId, active);
    refresh();
  });
}

export async function setSubscriptionValidityAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { subscriptionId, startsOn, endsOn } = parseInput(subscriptionValiditySchema, input);
    const { db } = await actionContext('admin');
    await setSubscriptionValidity(db, subscriptionId, startsOn, endsOn);
    refresh();
  });
}

/* ------------------------------ configuration ------------------------------ */

export async function savePlanAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(planSchema, input);
    const { db } = await actionContext('admin');
    await savePlan(db, data);
    refresh();
  });
}

export async function saveSettingsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(settingsSchema, input);
    const { db } = await actionContext('admin');
    await updateSettings(db, {
      cancellation_cutoff_hours: data.cancellationCutoffHours,
      default_capacity: data.defaultCapacity,
      default_time_slots: data.defaultTimeSlots,
    });
    refresh();
  });
}
