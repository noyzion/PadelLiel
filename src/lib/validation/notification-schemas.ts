import { z } from 'zod';

/** Runtime validation for the notification server actions (every value comes from the browser). */

const id = z.string().uuid('מזהה לא תקין');

export const notificationIdSchema = z.object({ id });

export const preferencesPatchSchema = z
  .object({
    pushEnabled: z.boolean().optional(),
    trainingReminders: z.boolean().optional(),
    cancellationDeadlineReminders: z.boolean().optional(),
    bookingUpdates: z.boolean().optional(),
    weeklySchedule: z.boolean().optional(),
  })
  .strict();

/** A Web Push subscription as the browser reports it (`PushSubscription.toJSON()`). */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url('כתובת ההתראות לא תקינה')
    .max(2048)
    .refine((v) => v.startsWith('https://'), 'כתובת ההתראות חייבת להיות מאובטחת'),
  p256dh: z.string().min(1).max(256),
  auth: z.string().min(1).max(128),
  userAgent: z.string().max(300).optional(),
});

export const pushEndpointSchema = z.object({
  endpoint: z.string().url().max(2048),
});
