import type { BookingStatus } from './types';

/** One-time trial session price (ILS). Collected in person at the session; not charged in the app. */
export const TRIAL_SESSION_PRICE_ILS = 50;

/** Admin member list: she booked or completed her one-time trial. */
export const TRIAL_MEMBER_TAG_HE = 'אימון ניסיון';

/** Matches when a trial slot is in use or was consumed (see `trial_is_available`). */
export const TRIAL_CONSUMING_BOOKING_STATUSES = [
  'CONFIRMED',
  'ATTENDED',
  'NO_SHOW',
  'CANCELLED_LATE',
] as const satisfies readonly BookingStatus[];

export function formatTrialPriceHe(): string {
  return `${TRIAL_SESSION_PRICE_ILS} ₪`;
}

export function memberHadTrialSession(bookings: { is_trial: boolean; status: BookingStatus }[]): boolean {
  const consuming = new Set<string>(TRIAL_CONSUMING_BOOKING_STATUSES);
  return bookings.some((b) => b.is_trial && consuming.has(b.status));
}