import 'server-only';
import { cache } from 'react';
import type { Db } from '@/lib/supabase/server';
import type { Allowance, CancelResult, MyBooking, ScheduleSession, MonthlyUsageRow } from '@/lib/domain/types';
import { toAppError } from '@/lib/domain/errors';
import { rpc } from '../rpc';

/**
 * Thin wrappers over the booking-engine SQL functions. No business rule is evaluated here:
 * the database decides eligibility, allowance, capacity and early/late cancellation.
 *
 * Read helpers are memoised per request so a layout and a page (or two callers on the same page)
 * never hit the same RPC twice.
 */

export const getWeekSchedule = cache(async (db: Db, weekStart: string) => {
  const rows = await rpc<ScheduleSession[]>(db, 'get_week_schedule', { p_week_start: weekStart });
  return (rows ?? []).map((s) => ({ ...s, my_booking_is_trial: Boolean(s.my_booking_is_trial) }));
});

/**
 * Whether the caller can see any session in that week. Uses a head-count on `sessions` (RLS hides
 * drafts and cancelled sessions from trainees) so the schedule page does not depend on a new RPC
 * that may not be applied yet.
 */
export const weekHasSessions = cache(async (db: Db, weekStart: string): Promise<boolean> => {
  const { count, error } = await db
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('week_start', weekStart)
    .neq('status', 'CANCELLED');
  if (error) throw toAppError(error);
  return (count ?? 0) > 0;
});

export const getMyBookings = cache(async (db: Db) => {
  const rows = await rpc<MyBooking[]>(db, 'get_my_bookings');
  return (rows ?? [])
    .map((b) => ({ ...b, is_trial: Boolean(b.is_trial) }))
    .filter((b) => b.session_status !== 'CANCELLED');
});

/** The single, centralized monthly-quota calculation (`monthStart` = any date in the month). */
export const getAllowance = cache(async (db: Db, memberId: string, monthStart: string): Promise<Allowance> => {
  const rows = await rpc<Allowance[]>(db, 'get_member_allowance', { p_member_id: memberId, p_month_start: monthStart });
  const row = rows[0];
  return { ...row, trial_available: Boolean(row?.trial_available) };
});

export const getMonthlyUsage = cache((db: Db, memberId: string, fromMonth: string, toMonth: string) => {
  return rpc<MonthlyUsageRow[]>(db, 'get_member_monthly_usage', {
    p_member_id: memberId,
    p_from_month: fromMonth,
    p_to_month: toMonth,
  });
});

export function bookSession(db: Db, sessionId: string, ackLatePolicy: boolean) {
  return rpc<string>(db, 'book_session', { p_session_id: sessionId, p_ack_late_policy: ackLatePolicy });
}

export function cancelBooking(db: Db, bookingId: string, confirmLate: boolean) {
  return rpc<CancelResult>(db, 'cancel_booking', { p_booking_id: bookingId, p_confirm_late: confirmLate });
}

export function joinWaitlist(db: Db, sessionId: string) {
  return rpc<string>(db, 'join_waitlist', { p_session_id: sessionId });
}

export async function leaveWaitlist(db: Db, entryId: string) {
  await rpc<null>(db, 'leave_waitlist', { p_entry_id: entryId });
}
