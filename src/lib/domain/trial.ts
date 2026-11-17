/** One-time trial session price (ILS). Collected in person at the session; not charged in the app. */
export const TRIAL_SESSION_PRICE_ILS = 50;

export function formatTrialPriceHe(): string {
  return `${TRIAL_SESSION_PRICE_ILS} ₪`;
}