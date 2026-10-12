import type { ApprovalStatus, BookingStatus, SessionStatus, WaitlistStatus } from './types';

export const BOOKING_STATUS_LABEL_HE: Record<BookingStatus, string> = {
  CONFIRMED: 'רשומה',
  ATTENDED: 'השתתפה',
  NO_SHOW: 'לא הגיעה',
  CANCELLED_EARLY: 'בוטל בזמן',
  CANCELLED_LATE: 'בוטל מאוחר',
  CANCELLED_BY_COACH: 'בוטל ע״י המאמנת',
};

export type Tone = 'neutral' | 'rose' | 'green' | 'amber' | 'red' | 'blue';

export const BOOKING_STATUS_TONE: Record<BookingStatus, Tone> = {
  CONFIRMED: 'rose',
  ATTENDED: 'green',
  NO_SHOW: 'red',
  CANCELLED_EARLY: 'neutral',
  CANCELLED_LATE: 'amber',
  CANCELLED_BY_COACH: 'neutral',
};

export const SESSION_STATUS_LABEL_HE: Record<SessionStatus, string> = {
  DRAFT: 'טיוטה',
  PUBLISHED: 'פורסם',
  CANCELLED: 'בוטל',
  COMPLETED: 'הסתיים',
};

export const SESSION_STATUS_TONE: Record<SessionStatus, Tone> = {
  DRAFT: 'amber',
  PUBLISHED: 'green',
  CANCELLED: 'red',
  COMPLETED: 'neutral',
};

export const APPROVAL_LABEL_HE: Record<ApprovalStatus, string> = {
  pending: 'ממתינה לאישור',
  approved: 'מאושרת',
  rejected: 'נדחתה',
};

export const APPROVAL_TONE: Record<ApprovalStatus, Tone> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
};

export const WAITLIST_STATUS_LABEL_HE: Record<WaitlistStatus, string> = {
  WAITING: 'ממתינה',
  PROMOTED: 'שובצה',
  LEFT: 'עזבה',
  REMOVED: 'הוסרה',
};

/** Fallback labels; the live labels come from the skill_levels table. */
export const DEFAULT_LEVEL_LABEL_HE: Record<string, string> = {
  beginner: 'מתחילות',
  intermediate: 'בינוניות',
  advanced: 'מתקדמות',
};

export function levelLabel(code: string | null | undefined, levels?: { code: string; label_he: string }[]): string {
  if (!code) return 'ללא רמה';
  return levels?.find((l) => l.code === code)?.label_he ?? DEFAULT_LEVEL_LABEL_HE[code] ?? code;
}
