import 'server-only';
import type { Db } from '@/lib/supabase/server';
import type { BookingStatus } from '@/lib/domain/types';
import { rpc } from '../rpc';

/** Administrative booking operations. Capacity and weekly allowance can never be bypassed (enforced in SQL). */

export function assignBooking(db: Db, p: { sessionId: string; memberId: string; overrideSkill: boolean; note?: string }) {
  return rpc<string>(db, 'admin_assign_booking', {
    p_session_id: p.sessionId,
    p_member_id: p.memberId,
    p_override_skill: p.overrideSkill,
    p_note: p.note ?? null,
  });
}

export async function setBookingStatus(db: Db, bookingId: string, status: BookingStatus, note?: string) {
  await rpc<null>(db, 'admin_set_booking_status', { p_booking_id: bookingId, p_status: status, p_note: note ?? null });
}

export function restoreAllowance(db: Db, bookingId: string, reason: string) {
  return rpc<string>(db, 'admin_restore_allowance', { p_booking_id: bookingId, p_reason: reason });
}

export function adjustAllowance(db: Db, p: { memberId: string; weekStart: string; delta: number; reason: string }) {
  return rpc<string>(db, 'admin_adjust_allowance', {
    p_member_id: p.memberId,
    p_week_start: p.weekStart,
    p_delta: p.delta,
    p_reason: p.reason,
  });
}

export function promoteWaitlistEntry(db: Db, entryId: string) {
  return rpc<string>(db, 'admin_promote_waitlist_entry', { p_entry_id: entryId });
}

export async function removeWaitlistEntry(db: Db, entryId: string) {
  await rpc<null>(db, 'admin_remove_waitlist_entry', { p_entry_id: entryId });
}
