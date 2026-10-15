import 'server-only';
import { cache } from 'react';
import type { Db } from '@/lib/supabase/server';
import type { Allowance, CancelResult, MyBooking, ScheduleSession, MonthlyUsageRow } from '@/lib/domain/types';
import { rpc } from '../rpc';

/**
 * Thin wrappers over the booking-engine SQL functions. No business rule is evaluated here:
 * the database decides eligibility, allowance, capacity and early/late cancellation.
 *
 * Read helpers are memoised per request so a layout and a page (or two callers on the same page)
 * never hit the same RPC twice.
 */

export const getWeekSchedule = cache((db: Db, weekStart: string) => {
  return rpc<ScheduleSession[]>(db, 'get_week_schedule', { p_week_start: weekStart });
});

/** Whether the caller can see any session in that week (drafts only for admins). */
export const weekHasSessions = cache((db: Db, weekStart: string) => {
  return rpc<boolean>(db, 'week_has_sessions', { p_week_start: weekStart });
});

export const getMyBookings = cache((db: Db) => {
  return rpc<MyBooking[]>(db, 'get_my_bookings');
});

/** The single, centralized monthly-quota calculation (`monthStart` = any date in the month). */
export const getAllowance = cache(async (db: Db, memberId: string, monthStart: string): Promise<Allowance> => {
  const rows = await rpc<Allowance[]>(db, 'get_member_allowance', { p_member_id: memberId, p_month_start: monthStart });
  return rows[0];
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
