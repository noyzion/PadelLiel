import type { ScheduleSession } from './types';

export interface WeekStats {
  weekStart: string;
  sessions: number;
  capacity: number;
  occupied: number;
  fullSessions: number;
  waiting: number;
  occupancyPercent: number;
}

/** Counts are derived from published sessions only (drafts and cancelled sessions are excluded). */
export function computeWeekStats(weekStart: string, sessions: ScheduleSession[]): WeekStats {
  const live = sessions.filter((s) => s.status === 'PUBLISHED' || s.status === 'COMPLETED');
  const capacity = live.reduce((sum, s) => sum + s.capacity, 0);
  const occupied = live.reduce((sum, s) => sum + s.occupied_count, 0);
  return {
    weekStart,
    sessions: live.length,
    capacity,
    occupied,
    fullSessions: live.filter((s) => s.occupied_count >= s.capacity).length,
    waiting: live.reduce((sum, s) => sum + s.waitlist_count, 0),
    occupancyPercent: capacity === 0 ? 0 : Math.round((occupied / capacity) * 100),
  };
}

