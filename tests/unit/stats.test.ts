import { describe, expect, it } from 'vitest';
import { computeWeekStats } from '@/lib/domain/stats';
import type { ScheduleSession } from '@/lib/domain/types';

function session(over: Partial<ScheduleSession>): ScheduleSession {
  return {
    id: 'x',
    session_date: '2026-11-01',
    start_time: '07:00:00',
    end_time: '08:00:00',
    starts_at: '2026-11-01T05:00:00Z',
    ends_at: '2026-11-01T06:00:00Z',
    week_start: '2026-11-01',
    skill_level_code: 'beginner',
    capacity: 4,
    status: 'PUBLISHED',
    registration_open: true,
    notes: null,
    occupied_count: 0,
    waitlist_count: 0,
    my_booking_id: null,
    my_booking_status: null,
    my_waitlist_entry_id: null,
    my_waitlist_position: null,
    block_reason: null,
    cancellation_deadline: '2026-10-31T21:00:00Z',
    is_late_window: false,
    my_booking_is_trial: false,
    ...over,
  };
}

describe('computeWeekStats', () => {
  it('returns zeros for an empty week', () => {
    expect(computeWeekStats('2026-11-01', [])).toMatchObject({ sessions: 0, capacity: 0, occupied: 0, occupancyPercent: 0 });
  });

  it('ignores drafts and cancelled sessions', () => {
    const stats = computeWeekStats('2026-11-01', [
      session({ status: 'DRAFT', occupied_count: 0 }),
      session({ status: 'CANCELLED', occupied_count: 3 }),
      session({ status: 'PUBLISHED', occupied_count: 2, waitlist_count: 1 }),
    ]);
    expect(stats).toMatchObject({ sessions: 1, capacity: 4, occupied: 2, waiting: 1, occupancyPercent: 50, fullSessions: 0 });
  });

  it('counts full sessions and rounds occupancy', () => {
    const stats = computeWeekStats('2026-11-01', [
      session({ occupied_count: 4 }),
      session({ occupied_count: 1 }),
      session({ occupied_count: 0, status: 'COMPLETED' }),
    ]);
    expect(stats.fullSessions).toBe(1);
    expect(stats.occupancyPercent).toBe(Math.round((5 / 12) * 100));
  });
});
