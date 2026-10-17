/**
 * Business error codes raised by the database (`app_error`) and their Hebrew messages.
 * Codes are raised by the SQL functions in supabase/migrations.
 */

export const ERROR_MESSAGES_HE = {
  NOT_AUTHENTICATED: 'יש להתחבר כדי לבצע פעולה זו.',
  NOT_AUTHORIZED: 'אין לך הרשאה לבצע פעולה זו.',
  MEMBER_NOT_FOUND: 'המתאמנת לא נמצאה.',
  MEMBER_HAS_HISTORY: 'למתאמנת יש היסטוריית אימונים או התאמות מכסה, ולכן אי אפשר למחוק אותה. אפשר להגדיר אותה כלא פעילה.',
  MEMBER_NOT_APPROVED: 'החשבון שלך עדיין ממתין לאישור המאמנת.',
  NO_ACTIVE_SUBSCRIPTION: 'אין מנוי פעיל לתאריך האימון. פני למאמנת.',
  TRIAL_ALREADY_USED: 'אימון הניסיון כבר נוצל. פני למאמנת כדי להפעיל מנוי.',
  NO_SKILL_LEVEL: 'עדיין לא הוגדרה לך רמה. פני למאמנת.',
  SESSION_NOT_FOUND: 'האימון לא נמצא.',
  SESSION_NOT_PUBLISHED: 'האימון אינו זמין להרשמה.',
  REGISTRATION_CLOSED: 'ההרשמה לאימון זה סגורה.',
  SESSION_STARTED: 'האימון כבר התחיל.',
  SKILL_LEVEL_MISMATCH: 'האימון מיועד לרמה אחרת.',
  NO_ALLOWANCE_REMAINING: 'ניצלת את כל האימונים החודשיים במנוי שלך.',
  SESSION_FULL: 'האימון מלא.',
  SESSION_NOT_FULL: 'יש מקום פנוי באימון, אפשר להירשם ישירות.',
  ALREADY_BOOKED: 'את כבר רשומה לאימון הזה.',
  OVERLAPPING_BOOKING: 'את כבר רשומה לאימון אחר באותה שעה.',
  LATE_POLICY_ACK_REQUIRED: 'יש לאשר את מדיניות הביטול לפני ההרשמה.',
  LATE_CANCELLATION_CONFIRMATION_REQUIRED: 'יש לאשר ביטול מאוחר לפני השלמת הביטול.',
  BOOKING_NOT_FOUND: 'ההרשמה לא נמצאה.',
  INVALID_BOOKING_STATE: 'לא ניתן לבצע פעולה זו על ההרשמה במצבה הנוכחי.',
  INVALID_STATUS_TRANSITION: 'לא ניתן לשנות סטטוס של הרשמה שבוטלה.',
  ATTENDANCE_BEFORE_START: 'אפשר לסמן נוכחות רק לאחר תחילת האימון.',
  ALREADY_ON_WAITLIST: 'את כבר ברשימת ההמתנה לאימון זה.',
  WAITLIST_ENTRY_NOT_FOUND: 'הרישום לרשימת ההמתנה לא נמצא.',
  ADJUSTMENT_ALREADY_APPLIED: 'האימון הזה כבר הוחזר למכסה.',
  SESSION_OVERLAP: 'יש רק מגרש אחד, ולכן כבר קיים אימון חופף בשעות האלה.',
  SESSION_HAS_BOOKINGS: 'יש הרשמות לאימון. בטלי את האימון במקום זאת.',
  SESSION_WEEK_CHANGE_NOT_ALLOWED: 'אי אפשר להעביר אימון עם הרשמות לשבוע אחר. בטלי וצרי אימון חדש.',
  SESSION_MONTH_CHANGE_NOT_ALLOWED: 'אי אפשר להעביר אימון עם הרשמות לחודש אחר. בטלי וצרי אימון חדש.',
  CAPACITY_BELOW_OCCUPANCY: 'הקיבולת קטנה ממספר הרשומות באימון.',
  PLAN_NOT_FOUND: 'המנוי לא נמצא.',
  ANOTHER_SUBSCRIPTION_ACTIVE: 'כבר קיים מנוי פעיל למתאמנת. החליפי מנוי במקום להפעיל ישן.',
  EVENT_NOT_FOUND: 'האירוע לא נמצא.',
  INVALID_INPUT: 'הנתונים שהוזנו אינם תקינים.',
  INTERNAL: 'אירעה שגיאה. נסי שוב בעוד רגע.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES_HE;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES_HE, value);
}

export function errorMessageHe(code: ErrorCode | string | null | undefined): string {
  return isErrorCode(code) ? ERROR_MESSAGES_HE[code] : ERROR_MESSAGES_HE.INTERNAL;
}

/** Short explanation for a disabled booking button (`block_reason` from the schedule). */
export function blockReasonHe(reason: string | null): string | null {
  if (!reason) return null;
  switch (reason) {
    case 'NO_ALLOWANCE_REMAINING':
      return 'הגעת למכסה החודשית של המנוי שלך';
    case 'SKILL_LEVEL_MISMATCH':
      return 'האימון מיועד לרמה אחרת';
    case 'OVERLAPPING_BOOKING':
      return 'את רשומה לאימון אחר באותה שעה';
    case 'REGISTRATION_CLOSED':
      return 'ההרשמה סגורה';
    case 'SESSION_STARTED':
      return 'האימון כבר התחיל';
    case 'NO_ACTIVE_SUBSCRIPTION':
      return 'אין מנוי פעיל לתאריך זה';
    case 'TRIAL_ALREADY_USED':
      return 'אימון הניסיון כבר נוצל';
    case 'MEMBER_NOT_APPROVED':
      return 'ממתין לאישור המאמנת';
    case 'NO_SKILL_LEVEL':
      return 'טרם הוגדרה לך רמה';
    case 'SESSION_NOT_PUBLISHED':
      return 'האימון אינו זמין';
    default:
      return errorMessageHe(reason);
  }
}

/** Raised by server-side services; carries a stable machine-readable code. */
export class AppError extends Error {
  readonly code: ErrorCode;
  /** Optional specific Hebrew message (e.g. a validation message). Falls back to the code's message. */
  readonly userMessage?: string;

  constructor(code: ErrorCode, options?: { cause?: unknown; userMessage?: string }) {
    super(code, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = options?.userMessage;
  }
}

interface PostgrestLikeError {
  message?: string;
  code?: string;
}

/** Converts a Supabase/PostgREST error into an AppError. Unknown errors become INTERNAL. */
export function toAppError(error: PostgrestLikeError | null | undefined): AppError {
  if (error?.code === 'P0001' && isErrorCode(error.message)) return new AppError(error.message, { cause: error });
  if (error?.code === '42501') return new AppError('NOT_AUTHORIZED', { cause: error });
  if (error?.code === '23505') return new AppError('INVALID_INPUT', { cause: error });
  if (error?.code === '23514' || error?.code === '22P02' || error?.code === '22007') {
    return new AppError('INVALID_INPUT', { cause: error });
  }
  return new AppError('INTERNAL', { cause: error });
}
