import { PadelRackets } from '@/components/brand';
import { VENUE_NAME } from '@/lib/brand';

/** Quiet, static community line. Not a carousel or an ad: one sentence, low dose of colour. */
export function CommunityBanner() {
  return (
    <div className="relative overflow-hidden rounded-card border border-sun-200 bg-sun-100 py-5 pe-28 ps-5">
      <PadelRackets className="absolute end-4 top-1/2 w-[4.5rem] -translate-y-1/2" />
      <p className="relative text-card font-bold text-navy-900">הבוקר שלך מתחיל כאן</p>
      <p className="relative text-small text-muted">אימוני פאדל לנשים ב{VENUE_NAME}</p>
    </div>
  );
}
