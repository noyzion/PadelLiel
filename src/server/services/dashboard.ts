import 'server-only';
import type { Db } from '@/lib/supabase/server';
import { computeWeekStats, type WeekStats } from '@/lib/domain/stats';
import type { BookingStatus, ScheduleSession } from '@/lib/domain/types';
import { shiftWeek } from '@/lib/time';
import { embedded, unwrap } from '../rpc';
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
      .select(
        'id, status, cancelled_at, member_id, session_id, profiles!bookings_member_id_fkey(full_name), sessions!bookings_session_id_fkey(session_date, start_time, end_time)',
      )
      .in('status', ['CANCELLED_EARLY', 'CANCELLED_LATE', 'CANCELLED_BY_COACH'])
      .order('cancelled_at', { ascending: false, nullsFirst: false })
      .limit(8),
  ]);

  const cancelledRows = (unwrap(cancelled) ?? []) as unknown as {
    id: string;
    status: BookingStatus;
    cancelled_at: string | null;
    member_id: string;
    session_id: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
    sessions: { session_date: string; start_time: string; end_time: string } | { session_date: string; start_time: string; end_time: string }[] | null;
  }[];

  return {
    thisWeek,
    nextWeek,
    stats: {
      thisWeek: computeWeekStats(currentWeek, thisWeek),
      nextWeek: computeWeekStats(nextWeekStart, nextWeek),
    },
    pendingApprovals: pending.count ?? 0,
    recentCancellations: cancelledRows.flatMap((r) => {
      const session = embedded(r.sessions);
      if (!session) return [];
      return [
        {
          booking_id: r.id,
          status: r.status,
          cancelled_at: r.cancelled_at,
          member_name: embedded(r.profiles)?.full_name ?? '-',
          session_id: r.session_id,
          session_date: session.session_date,
          start_time: session.start_time,
          end_time: session.end_time,
        },
      ];
    }),
  };
}

export async function getAuditLog(db: Db, limit = 100) {
  const logs = unwrap(
    await db
      .from('audit_logs')
      .select('id, actor_id, action, entity_type, entity_id, created_at, profiles!audit_logs_actor_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as unknown as {
    id: number;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    created_at: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  }[];
  return logs.map(({ profiles, ...l }) => ({
    ...l,
    actor_name: l.actor_id ? (embedded(profiles)?.full_name ?? '-') : 'מערכת',
  }));
}
