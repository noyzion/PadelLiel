import { COMMUNITY_TIME_ZONE } from '@/lib/time';

/**
 * iCalendar (RFC 5545) export of a confirmed training session, for "הוספה ליומן".
 *
 * The event carries a TZID=Asia/Jerusalem start/end with a matching VTIMEZONE (Israel DST rules), so every
 * calendar app converts it correctly. A calendar file that was imported by hand is a COPY: it is not updated
 * when the booking changes or the coach cancels the session. The app's notifications are what stays current.
 */

export const CALENDAR_LOCATION = 'מרכז הטניס כוכב יאיר';
export const CALENDAR_TITLE = 'אימון פאדל';

export interface IcsSession {
  /** Stable id of the booking: re-importing the same file updates the same calendar entry. */
  bookingId: string;
  /** YYYY-MM-DD, Israel local date. */
  sessionDate: string;
  /** HH:MM or HH:MM:SS, Israel local time. */
  startTime: string;
  endTime: string;
  notes?: string | null;
}

/** RFC 5545 TEXT escaping. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets (never inside a multi-byte character), continuation lines start with a space. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74; // the leading space counts as one octet
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function localStamp(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.slice(0, 2)}${time.slice(3, 5)}00`;
}

function utcStamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${COMMUNITY_TIME_ZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:IDT',
  'DTSTART:20130329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=FR;BYMONTHDAY=23,24,25,26,27,28,29',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:IST',
  'DTSTART:20131027T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function buildBookingIcs(session: IcsSession, now: Date = new Date()): string {
  const description = ['האימון נקבע דרך אפליקציית האימונים.', 'אם האימון משתנה או מתבטל, העדכון יישלח באפליקציה - אירוע שיובא ליומן לא מתעדכן אוטומטית.'];
  if (session.notes) description.push(session.notes);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PadelLiel//Training//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-TIMEZONE:${COMMUNITY_TIME_ZONE}`,
    ...VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:booking-${session.bookingId}@padelliel`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=${COMMUNITY_TIME_ZONE}:${localStamp(session.sessionDate, session.startTime)}`,
    `DTEND;TZID=${COMMUNITY_TIME_ZONE}:${localStamp(session.sessionDate, session.endTime)}`,
    `SUMMARY:${escapeIcsText(CALENDAR_TITLE)}`,
    `LOCATION:${escapeIcsText(CALENDAR_LOCATION)}`,
    `DESCRIPTION:${escapeIcsText(description.join('\n'))}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(CALENDAR_TITLE)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
