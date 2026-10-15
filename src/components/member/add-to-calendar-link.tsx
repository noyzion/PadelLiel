import { CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Downloads an .ics of a confirmed booking. A plain <a> (not next/link) so the file is never prefetched.
 * An imported calendar event is a copy: it does not update if the booking later changes.
 */
export function AddToCalendarLink({ bookingId, className }: { bookingId: string; className?: string }) {
  return (
    <a
      href={`/bookings/${bookingId}/calendar`}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 self-start rounded-control px-2 text-small font-semibold text-ocean-700 hover:bg-ocean-50 focus-visible:outline-3',
        className,
      )}
    >
      <CalendarPlus className="size-4" aria-hidden="true" />
      הוספה ליומן
    </a>
  );
}
