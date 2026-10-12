import 'server-only';
import type { Db } from '@/lib/supabase/server';
import type {
  Allowance,
  BookingStatus,
  MemberOverview,
  MemberSubscription,
  Profile,
  SessionRow,
  SubscriptionPlan,
  MonthlyUsageRow,
} from '@/lib/domain/types';
import { shiftMonth } from '@/lib/time';
import { rpc, unwrap } from '../rpc';
import { getAllowance, getMonthlyUsage } from './booking';

export function listMembers(db: Db, monthStart: string) {
  return rpc<MemberOverview[]>(db, 'admin_list_members', { p_month_start: monthStart });
}

export async function updateMember(db: Db, memberId: string, patch: Record<string, unknown>) {
  await rpc<null>(db, 'admin_update_member', { p_member_id: memberId, p_patch: patch });
}

export function assignSubscription(
  db: Db,
  p: { memberId: string; planId: string; startsOn?: string; endsOn?: string },
) {
  return rpc<string>(db, 'admin_assign_subscription', {
    p_member_id: p.memberId,
    p_plan_id: p.planId,
    p_starts_on: p.startsOn ?? null,
    p_ends_on: p.endsOn ?? null,
  });
}

export async function setSubscriptionActive(db: Db, subscriptionId: string, active: boolean) {
  await rpc<null>(db, 'admin_set_subscription_active', { p_subscription_id: subscriptionId, p_active: active });
}

export async function setSubscriptionValidity(db: Db, subscriptionId: string, startsOn: string, endsOn?: string) {
  await rpc<null>(db, 'admin_set_subscription_validity', {
    p_subscription_id: subscriptionId,
    p_starts_on: startsOn,
    p_ends_on: endsOn ?? null,
  });
}

export interface MemberBookingRow {
  id: string;
  status: BookingStatus;
  booked_at: string;
  cancelled_at: string | null;
  session: Pick<SessionRow, 'id' | 'session_date' | 'start_time' | 'end_time' | 'starts_at' | 'skill_level_code' | 'status' | 'week_start'> | null;
  allowance_restored: boolean;
}

export interface AdjustmentRow {
  id: string;
  month_start: string;
  delta: number;
  kind: string;
  reason: string;
  created_at: string;
}

export interface MemberDetail {
  profile: Profile;
  subscriptions: (MemberSubscription & { plan_name: string; monthly_limit: number })[];
  thisMonth: Allowance;
  nextMonth: Allowance;
  usage: MonthlyUsageRow[];
  bookings: MemberBookingRow[];
  adjustments: AdjustmentRow[];
}

export async function getMemberDetail(db: Db, memberId: string, currentMonth: string): Promise<MemberDetail | null> {
  const profile = unwrap(
    await db.from('profiles').select('*').eq('id', memberId).eq('role', 'trainee').maybeSingle(),
  ) as Profile | null;
  if (!profile) return null;

  const nextMonthStart = shiftMonth(currentMonth, 1);
  const [subs, plans, thisMonth, nextMonth, usage, bookings, adjustments] = await Promise.all([
    db.from('member_subscriptions').select('*').eq('member_id', memberId).order('starts_on', { ascending: false }),
    db.from('subscription_plans').select('*'),
    getAllowance(db, memberId, currentMonth),
    getAllowance(db, memberId, nextMonthStart),
    getMonthlyUsage(db, memberId, shiftMonth(currentMonth, -3), nextMonthStart),
    db.from('bookings').select('*').eq('member_id', memberId).order('created_at', { ascending: false }).limit(200),
    db.from('allowance_adjustments').select('*').eq('member_id', memberId).order('created_at', { ascending: false }),
  ]);

  const planById = new Map((unwrap(plans) as SubscriptionPlan[]).map((p) => [p.id, p]));
  const bookingRows = unwrap(bookings) as (Omit<MemberBookingRow, 'session' | 'allowance_restored'> & {
    session_id: string;
  })[];
  const adjustmentRows = unwrap(adjustments) as (AdjustmentRow & { related_booking_id: string | null })[];

  const sessionIds = [...new Set(bookingRows.map((b) => b.session_id))];
  const sessions = sessionIds.length
    ? (unwrap(
        await db
          .from('sessions')
          .select('id, session_date, start_time, end_time, starts_at, skill_level_code, status, week_start')
          .in('id', sessionIds),
      ) as NonNullable<MemberBookingRow['session']>[])
    : [];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const restored = new Set(
    adjustmentRows.filter((a) => a.kind === 'restore_booking').map((a) => a.related_booking_id),
  );

  return {
    profile,
    subscriptions: (unwrap(subs) as MemberSubscription[]).map((s) => ({
      ...s,
      plan_name: planById.get(s.plan_id)?.name ?? '—',
      monthly_limit: planById.get(s.plan_id)?.monthly_session_limit ?? 0,
    })),
    thisMonth,
    nextMonth,
    usage,
    bookings: bookingRows
      .map((b) => ({
        id: b.id,
        status: b.status,
        booked_at: b.booked_at,
        cancelled_at: b.cancelled_at,
        session: sessionById.get(b.session_id) ?? null,
        allowance_restored: restored.has(b.id),
      }))
      .sort((a, b) => (b.session?.starts_at ?? '').localeCompare(a.session?.starts_at ?? '')),
    adjustments: adjustmentRows,
  };
}

/** Approved trainees (for the "add trainee to session" picker). */
export async function listAssignableMembers(db: Db) {
  return unwrap(
    await db
      .from('profiles')
      .select('id, full_name, phone, skill_level_code')
      .eq('role', 'trainee')
      .eq('approval_status', 'approved')
      .order('full_name'),
  ) as Pick<Profile, 'id' | 'full_name' | 'phone' | 'skill_level_code'>[];
}
