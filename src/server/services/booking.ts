import 'server-only';
import type { Db } from '@/lib/supabase/server';
import type { Allowance, CancelResult, MyBooking, ScheduleSession, WeeklyUsageRow } from '@/lib/domain/types';
import { rpc } from '../rpc';

/**
 * Thin wrappers over the booking-engine SQL functions. No business rule is evaluated here:
 * the database decides eligibility, allowance, capacity and early/late cancellation.
 */

export function getWeekSchedule(db: Db, weekStart: string) {
  return rpc<ScheduleSession[]>(db, 'get_week_schedule', { p_week_start: weekStart });
}

export function getMyBookings(db: Db) {
  return rpc<MyBooking[]>(db, 'get_my_bookings');
}

/** The single, centralized weekly-allowance calculation. */
export async function getAllowance(db: Db, memberId: string, weekStart: string): Promise<Allowance> {
  const rows = await rpc<Allowance[]>(db, 'get_member_allowance', { p_member_id: memberId, p_week_start: weekStart });
  return rows[0];
}

export function getWeeklyUsage(db: Db, memberId: string, fromWeek: string, toWeek: string) {
  return rpc<WeeklyUsageRow[]>(db, 'get_member_weekly_usage', {
    p_member_id: memberId,
    p_from_week: fromWeek,
    p_to_week: toWeek,
  });
}

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
