import { z } from 'zod';
import { slotsOverlap } from '@/lib/domain/schedule-generator';
import { EVENT_DESCRIPTION_MAX, EVENT_LOCATION_MAX, EVENT_TITLE_MAX } from '@/lib/domain/events';
import { IMPORT_CONFIRM_PHRASE } from '@/lib/domain/event-import';
import { WHEN_INVALID, isValidWhenValue, parseEventWhen } from '@/lib/domain/event-when';
import { normalizeIsraeliMobile } from '@/lib/phone';
import { isValidDateString } from '@/lib/time';

/** Runtime validation for every untrusted input that reaches a server action. */

const uuid = z.string().uuid('מזהה לא תקין');
const dateString = z.string().refine(isValidDateString, 'תאריך לא תקין');
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה לא תקינה (HH:MM)');
const levelCode = z.string().regex(/^[a-z][a-z0-9_]*$/, 'רמה לא תקינה');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `עד ${max} תווים`)
    .optional()
    .transform((v) => (v ? v : undefined));

const phone = z
  .string()
  .trim()
  .min(7, 'מספר טלפון קצר מדי')
  .max(20, 'מספר טלפון ארוך מדי')
  .regex(/^[0-9+\-\s()]+$/, 'מספר טלפון יכול להכיל ספרות בלבד');

export const passwordSchema = z.string().min(8, 'הסיסמה חייבת להכיל לפחות 8 תווים').max(72, 'הסיסמה ארוכה מדי');

export const PHONE_INVALID_MESSAGE = 'מספר הטלפון לא נראה תקין. נסי מספר נייד ישראלי, למשל 050-123-4567';

/** An Israeli mobile number typed any reasonable way; the parsed value is canonical E.164 (`+9725XXXXXXXX`). */
export const israeliMobileSchema = z
  .string()
  .trim()
  .min(1, 'יש להזין מספר טלפון')
  .max(30, PHONE_INVALID_MESSAGE)
  .refine((v) => normalizeIsraeliMobile(v) !== null, PHONE_INVALID_MESSAGE)
  .transform((v) => normalizeIsraeliMobile(v) ?? v);

/** Everyone signs in with the phone number and password they registered with. */
export const loginSchema = z.object({
  phone: israeliMobileSchema,
  password: z.string().min(1, 'יש להזין סיסמה').max(72, 'הסיסמה ארוכה מדי'),
});

/** Trainees register with a name, a phone number and a password. No e-mail address. */
export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'יש להזין שם מלא').max(80, 'השם ארוך מדי'),
  phone: israeliMobileSchema,
  password: passwordSchema,
});

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2, 'יש להזין שם מלא').max(80, 'השם ארוך מדי'),
  /** Omitted for accounts that sign in with their phone number: that number is the login and is not editable here. */
  phone: phone.optional(),
});

/** A signed-in trainee choosing her own password: she must know the current one (it may be the temporary one from the coach). */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'יש להזין את הסיסמה הנוכחית').max(72, 'הסיסמה ארוכה מדי'),
    newPassword: passwordSchema,
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'הסיסמה החדשה חייבת להיות שונה מהנוכחית',
  });

export const bookSessionSchema = z.object({ sessionId: uuid, ackLatePolicy: z.boolean().default(false) });
export const cancelBookingSchema = z.object({ bookingId: uuid, confirmLate: z.boolean().default(false) });
export const sessionIdSchema = z.object({ sessionId: uuid });
export const entryIdSchema = z.object({ entryId: uuid });

export const sessionFormSchema = z
  .object({
    date: dateString,
    start: timeString,
    end: timeString,
    level: levelCode,
    capacity: z.coerce.number().int('מספר שלם').min(1, 'לפחות 1').max(50, 'עד 50'),
    registrationOpen: z.boolean().default(true),
    notes: optionalText(500),
  })
  .refine((v) => v.end > v.start, { path: ['end'], message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' });

// One court: every time slot is a single session with a single level, and slots cannot overlap.
export const bulkCreateSchema = z.object({
  weekStart: dateString,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'בחרי לפחות יום אחד').max(7),
  slots: z
    .array(
      z
        .object({ start: timeString, end: timeString })
        .refine((v) => v.end > v.start, 'שעת הסיום חייבת להיות אחרי שעת ההתחלה'),
    )
    .min(1, 'בחרי לפחות שעה אחת')
    .max(12)
    .refine((slots) => !slotsOverlap(slots), 'יש רק מגרש אחד, אי אפשר ליצור אימונים חופפים'),
  level: levelCode,
  capacity: z.coerce.number().int().min(1, 'לפחות 1').max(50, 'עד 50'),
});

export const duplicateWeekSchema = z.object({ fromWeek: dateString, toWeek: dateString });

export const updateSessionSchema = z.object({ sessionId: uuid, form: sessionFormSchema });

export const cancelSessionSchema = z.object({ sessionId: uuid, reason: optionalText(300) });

export const publishSessionsSchema = z.object({ sessionIds: z.array(uuid).min(1).max(200) });

export const assignBookingSchema = z.object({
  sessionId: uuid,
  memberId: uuid,
  overrideSkill: z.boolean().default(false),
  note: optionalText(300),
});

export const setBookingStatusSchema = z.object({
  bookingId: uuid,
  status: z.enum(['CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED_BY_COACH', 'CANCELLED_EARLY', 'CANCELLED_LATE']),
  note: optionalText(300),
});

export const restoreAllowanceSchema = z.object({
  bookingId: uuid,
  reason: z.string().trim().min(3, 'יש לציין סיבה').max(300),
});

export const adjustAllowanceSchema = z.object({
  memberId: uuid,
  monthStart: dateString,
  delta: z.coerce
    .number()
    .int('מספר שלם')
    .min(-31)
    .max(31)
    .refine((v) => v !== 0, 'ההתאמה לא יכולה להיות 0'),
  reason: z.string().trim().min(3, 'יש לציין סיבה').max(300),
});

export const memberPatchSchema = z
  .object({
    approval_status: z.enum(['pending', 'approved', 'rejected', 'inactive']).optional(),
    skill_level_code: z.union([levelCode, z.literal('')]).optional(),
    admin_notes: z.string().trim().max(2000).optional(),
    full_name: z.string().trim().min(2).max(80).optional(),
    phone: phone.optional(),
  })
  .strict();
export const updateMemberSchema = z.object({ memberId: uuid, patch: memberPatchSchema });
export const memberIdSchema = z.object({ memberId: uuid });

export const assignSubscriptionSchema = z
  .object({
    memberId: uuid,
    planId: uuid,
    startsOn: dateString.optional(),
  })
  .strict();

export const subscriptionActiveSchema = z.object({ subscriptionId: uuid, active: z.boolean() });

export const subscriptionValiditySchema = z
  .object({ subscriptionId: uuid, startsOn: dateString, endsOn: dateString.optional() })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, {
    path: ['endsOn'],
    message: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה',
  });

export const planSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2, 'יש להזין שם').max(60, 'השם ארוך מדי'),
  monthlyLimit: z.coerce.number().int('מספר שלם').min(1, 'לפחות 1').max(31, 'עד 31'),
  description: optionalText(200),
  isActive: z.boolean().default(true),
});

export const settingsSchema = z.object({
  cancellationCutoffHours: z.coerce.number().min(0, 'לפחות 0').max(168, 'עד 168'),
  defaultCapacity: z.coerce.number().int().min(1).max(50),
  defaultTimeSlots: z
    .array(
      z
        .object({ start: timeString, end: timeString })
        .refine((v) => v.end > v.start, 'שעת הסיום חייבת להיות אחרי שעת ההתחלה'),
    )
    .min(1, 'לפחות חלון זמן אחד')
    .max(12),
});

/* ------------------------------ community events ------------------------------ */

/**
 * "2026-11-02T18:30" (what a datetime-local input produces, Israel time), a plain date "2026-11-02" when the
 * clock time is not known (draft or published), or empty when there is no date yet (a draft only).
 * See `parseEventWhen` for the cross-field rules, including "publishing needs a date".
 */
const localWhen = z
  .string()
  .trim()
  .refine((v) => v === '' || isValidWhenValue(v), WHEN_INVALID);

const eventFields = z.object({
  title: z.string().trim().min(2, 'יש להזין כותרת').max(EVENT_TITLE_MAX, 'הכותרת ארוכה מדי'),
  description: z.string().trim().max(EVENT_DESCRIPTION_MAX, 'התיאור ארוך מדי').default(''),
  startsAt: localWhen,
  endsAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || isValidWhenValue(v), WHEN_INVALID),
  location: z.string().trim().min(1, 'יש להזין מיקום').max(EVENT_LOCATION_MAX, 'המיקום ארוך מדי'),
  /** The status the event should have after saving. */
  status: z.enum(['DRAFT', 'PUBLISHED']),
});

type EventFieldValues = z.infer<typeof eventFields>;

function refineEvent(v: EventFieldValues, ctx: z.RefinementCtx) {
  const when = parseEventWhen(v.startsAt, v.endsAt, v.status === 'PUBLISHED');
  if (!when.ok) ctx.addIssue({ code: 'custom', path: [when.path], message: when.message });
  if (v.status === 'PUBLISHED' && !v.description) {
    ctx.addIssue({ code: 'custom', path: ['description'], message: 'כדי לפרסם אירוע יש להוסיף תיאור' });
  }
}

export const eventFormSchema = eventFields.superRefine(refineEvent);

/** Create (no `id`) or update (with `id`); the image itself travels separately in the FormData. */
export const eventSaveSchema = eventFields
  .extend({ id: uuid.optional(), removeImage: z.boolean().default(false) })
  .superRefine(refineEvent);

/** Explicit approval to write the annual events (as drafts) to the database. */
export const eventImportSchema = z.object({
  confirm: z.literal(IMPORT_CONFIRM_PHRASE, { error: 'יש להקליד את מילת האישור כדי לייבא' }),
});

export const eventIdSchema = z.object({ eventId: uuid });
export const eventStatusSchema = z.object({ eventId: uuid, status: z.enum(['DRAFT', 'PUBLISHED']) });
export const eventRsvpSchema = z.object({
  eventId: uuid,
  status: z.enum(['GOING', 'NOT_GOING']),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'הנתונים שהוזנו אינם תקינים';
}
