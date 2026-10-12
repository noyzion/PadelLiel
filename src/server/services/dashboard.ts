import 'server-only';
import type { Db } from '@/lib/supabase/server';
import { computeWeekStats, type WeekStats } from '@/lib/domain/stats';
import type { BookingStatus, ScheduleSession } from '@/lib/domain/types';
import { shiftWeek } from '@/lib/time';
import { unwrap } from '../rpc';
import { getWeekSchedule } from './booking';

export interface RecentCancellation {
  booking_id: string;
  status: BookingStatus;
  cancelled_at: string | null;
  member_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_id: string;
}

export interface DashboardData {
  thisWeek: ScheduleSession[];
  nextWeek: ScheduleSession[];
  stats: { thisWeek: WeekStats; nextWeek: WeekStats };
  pendingApprovals: number;
  recentCancellations: RecentCancellation[];
}

export async function getDashboard(db: Db, currentWeek: string): Promise<DashboardData> {
  const nextWeekStart = shiftWeek(currentWeek, 1);
  const [thisWeek, nextWeek, pending, cancelled] = await Promise.all([
    getWeekSchedule(db, currentWeek),
    getWeekSchedule(db, nextWeekStart),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'trainee').eq('approval_status', 'pending'),
    db
      .from('bookings')
      .select('id, status, cancelled_at, member_id, session_id')
      .in('status', ['CANCELLED_EARLY', 'CANCELLED_LATE', 'CANCELLED_BY_COACH'])
      .order('cancelled_at', { ascending: false, nullsFirst: false })
      .limit(8),
  ]);

  const cancelledRows = unwrap(cancelled) as {
    id: string;
    status: BookingStatus;
    cancelled_at: string | null;
    member_id: string;
    session_id: string;
  }[];
  const memberIds = [...new Set(cancelledRows.map((r) => r.member_id))];
  const sessionIds = [...new Set(cancelledRows.map((r) => r.session_id))];
  const [members, sessions] = await Promise.all([
    memberIds.length ? db.from('profiles').select('id, full_name').in('id', memberIds) : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? db.from('sessions').select('id, session_date, start_time, end_time').in('id', sessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const memberById = new Map((unwrap(members) as { id: string; full_name: string }[]).map((m) => [m.id, m.full_name]));
  const sessionById = new Map(
    (unwrap(sessions) as { id: string; session_date: string; start_time: string; end_time: string }[]).map((s) => [s.id, s]),
  );

  return {
    thisWeek,
    nextWeek,
    stats: {
      thisWeek: computeWeekStats(currentWeek, thisWeek),
      nextWeek: computeWeekStats(nextWeekStart, nextWeek),
    },
    pendingApprovals: pending.count ?? 0,
    recentCancellations: cancelledRows
      .filter((r) => sessionById.has(r.session_id))
      .map((r) => {
        const s = sessionById.get(r.session_id)!;
        return {
          booking_id: r.id,
          status: r.status,
          cancelled_at: r.cancelled_at,
          member_name: memberById.get(r.member_id) ?? '-',
          session_id: r.session_id,
          session_date: s.session_date,
          start_time: s.start_time,
          end_time: s.end_time,
        };
      }),
  };
}

export async function getAuditLog(db: Db, limit = 100) {
  const logs = unwrap(
    await db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit),
  ) as { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; created_at: string }[];
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((x): x is string => Boolean(x)))];
  const actors = actorIds.length ? (unwrap(await db.from('profiles').select('id, full_name').in('id', actorIds)) as { id: string; full_name: string }[]) : [];
  const byId = new Map(actors.map((a) => [a.id, a.full_name]));
  return logs.map((l) => ({ ...l, actor_name: l.actor_id ? (byId.get(l.actor_id) ?? '-') : 'מערכת' }));
}
