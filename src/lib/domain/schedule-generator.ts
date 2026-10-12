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

/**
 * Expands "these weekdays × these time slots × these levels" into draft session rows for a week.
 * Weekdays use Sunday = 0 … Saturday = 6. Nothing about which days have sessions is hardcoded.
 */
export function generateWeekSessions(params: {
  weekStart: string;
  weekdays: number[];
  slots: TimeSlot[];
  levels: string[];
  capacity: number;
}): NewSessionRow[] {
  const start = weekStartOf(params.weekStart);
  const days = [...new Set(params.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  const rows: NewSessionRow[] = [];
  for (const day of days) {
    for (const slot of params.slots) {
      for (const level of params.levels) {
        rows.push({
          session_date: addDays(start, day),
          start_time: slot.start,
          end_time: slot.end,
          skill_level_code: level,
          capacity: params.capacity,
          status: 'DRAFT',
        });
      }
    }
  }
  return rows;
}
