import { addDays, israelDateOf, israelToday } from '@/lib/time';

/** Attendance confirmation for a published community event. Independent of training bookings. */
export type EventRsvpStatus = 'GOING' | 'NOT_GOING';

export const EVENT_RSVP_LABEL_HE: Record<EventRsvpStatus, string> = {
  GOING: 'מגיעה',
  NOT_GOING: 'לא מגיעה',
};

export const EVENT_RSVP_PROMPT_TITLE = 'באות?';
export const EVENT_RSVP_WINDOW_MS = 24 * 60 * 60 * 1000;

export const EVENT_RSVP_TOAST_HE: Record<EventRsvpStatus, string> = {
  GOING: 'שמחות שאת באה 💛🎾',
  NOT_GOING: 'תודה שעדכנת, נתראה בפעם הבאה',
};

export type EventRsvpWhen = 'today' | 'tomorrow' | 'soon';

/** Same Hebrew as `event_rsvp_prompt_copy` in the database. */
export function eventRsvpPromptWhen(startsAt: string, now: Date = new Date()): EventRsvpWhen {
  const eventDay = israelDateOf(startsAt);
  const today = israelToday(now);
  if (eventDay === today) return 'today';
  if (eventDay === addDays(today, 1)) return 'tomorrow';
  return 'soon';
}

export function eventRsvpPromptMessage(title: string, when: EventRsvpWhen): string {
  const lead = when === 'tomorrow' ? 'מחר יש' : when === 'today' ? 'היום יש' : 'עוד מעט יש';
  return `${lead} «${title}». נשמח לאישור הגעה, כדי שנדע לחכות לך 💛🎾`;
}

const GOING_NAMES_PREVIEW = 5;

/** Compact coach summary for one event on the events list. */
export function eventRsvpListSummary(rows: { status: EventRsvpStatus; full_name: string }[]): {
  going: number;
  notGoing: number;
  goingNames: string;
} {
  const going = rows.filter((r) => r.status === 'GOING');
  const names = going.map((r) => r.full_name);
  const goingNames =
    names.length > GOING_NAMES_PREVIEW
      ? `${names.slice(0, GOING_NAMES_PREVIEW).join(', ')} ועוד ${names.length - GOING_NAMES_PREVIEW}`
      : names.join(', ');
  return { going: going.length, notGoing: rows.length - going.length, goingNames };
}

export function isEventInRsvpWindow(
  event: { effective_starts_at: string | null; effective_ends_at: string | null },
  nowMs: number,
): boolean {
  if (!event.effective_starts_at || !event.effective_ends_at) return false;
  const starts = new Date(event.effective_starts_at).getTime();
  const ends = new Date(event.effective_ends_at).getTime();
  return ends > nowMs && starts <= nowMs + EVENT_RSVP_WINDOW_MS;
}
