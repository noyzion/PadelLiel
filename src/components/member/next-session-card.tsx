import { MapPin } from 'lucide-react';
import { SkillLevelBadge } from '@/components/domain/badges';
import { CancelBookingButton } from '@/components/member/cancel-booking';
import { Badge, Card } from '@/components/ui/card';
import { VENUE_NAME } from '@/lib/brand';
import type { MyBooking } from '@/lib/domain/types';
import { formatDateHe, formatInstantHe, formatTimeRange } from '@/lib/time';

/** The member's next confirmed session. Shows only what the database returned for her booking. */
export function NextSessionCard({
  booking,
  levelLabel,
  cutoffHours,
}: {
  booking: MyBooking;
  levelLabel: string;
  cutoffHours: number;
}) {
  const label = `${formatDateHe(booking.session_date)} · ${formatTimeRange(booking.start_time, booking.end_time)}`;
  return (
    <Card tone="blue" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-small font-semibold text-ocean-700">{formatDateHe(booking.session_date)}</p>
          <p className="num mt-1 text-hero font-semibold leading-none text-navy-900">
            <bdi>{formatTimeRange(booking.start_time, booking.end_time)}</bdi>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <SkillLevelBadge label={levelLabel} />
          <Badge tone="green">את רשומה</Badge>
        </div>
      </div>
      <p className="flex items-center gap-2 text-small text-muted">
        <MapPin className="size-4 shrink-0 text-ocean-700" aria-hidden="true" />
        {VENUE_NAME}
      </p>
      <div className="flex flex-col gap-3 border-t border-ocean-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-muted">
          ביטול שמחזיר את האימון למכסה אפשרי עד <span className="num font-semibold text-navy-900">{formatInstantHe(booking.cancellation_deadline)}</span>
        </p>
        <CancelBookingButton
          bookingId={booking.booking_id}
          isLateWindow={booking.is_late_window}
          cutoffHours={cutoffHours}
          label={label}
        />
      </div>
    </Card>
  );
}
