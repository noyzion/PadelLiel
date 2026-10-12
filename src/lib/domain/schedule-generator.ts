import { addDays, weekStartOf } from '@/lib/time';

export interface TimeSlot {
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface NewSessionRow {
  session_date: string;
  start_time: string;
  end_time: string;
  skill_level_code: string;
  capacity: number;
  status: 'DRAFT';
}

/** True when two time-of-day ranges share any time. Back-to-back slots (08:00 end, 08:00 start) do not overlap. */
export function slotsConflict(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

/** True when any two of the slots overlap. There is a single court, so slots must be disjoint. */
export function slotsOverlap(slots: TimeSlot[]): boolean {
  return slots.some((slot, i) => slots.slice(i + 1).some((other) => slotsConflict(slot, other)));
}

/**
 * Expands "these weekdays × these time slots" into draft session rows for a week, all with the same level.
 * There is a single court, so a time slot is exactly one session: there are no parallel sessions per level.
 * Weekdays use Sunday = 0 … Saturday = 6. Nothing about which days have sessions is hardcoded.
 */
export function generateWeekSessions(params: {
  weekStart: string;
  weekdays: number[];
  slots: TimeSlot[];
  level: string;
  capacity: number;
}): NewSessionRow[] {
  const start = weekStartOf(params.weekStart);
  const days = [...new Set(params.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  const rows: NewSessionRow[] = [];
  for (const day of days) {
    for (const slot of params.slots) {
      rows.push({
        session_date: addDays(start, day),
        start_time: slot.start,
        end_time: slot.end,
        skill_level_code: params.level,
        capacity: params.capacity,
        status: 'DRAFT',
      });
    }
  }
  return rows;
}
