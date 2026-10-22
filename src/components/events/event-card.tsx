import Image from 'next/image';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { EVENT_RSVP_LABEL_HE, type EventRsvpStatus } from '@/lib/domain/event-rsvp';
import {
  EVENT_DATE_TBA_HE,
  EVENT_TIME_TBA_HE,
  eventAnchor,
  eventWhenHe,
  isDateOnlyEvent,
  isUndatedEvent,
  splitParagraphs,
  type EventView,
} from '@/lib/domain/events';
import { formatEventDayNumberHe, formatEventMonthHe } from '@/lib/time';

/** Photo of the event, or (without one) the date set in plain typography on a soft blush panel. */
export function EventCover({
  event,
  sizes,
  className,
  preload = false,
  small = false,
}: {
  event: EventView;
  sizes: string;
  className?: string;
  preload?: boolean;
  /** Thumbnail size (admin lists): a smaller date when there is no photo. */
  small?: boolean;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-pink-100', className)}>
      {event.image_url ? (
        <Image
          src={event.image_url}
          alt=""
          fill
          sizes={sizes}
          preload={preload}
          // Admin previews show a local (blob:) file that has not been uploaded yet.
          unoptimized={event.image_url.startsWith('blob:')}
          className="object-cover"
        />
      ) : isUndatedEvent(event) ? (
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <span className={cn('font-medium text-pink-700', small ? 'text-caption' : 'text-body')}>{EVENT_DATE_TBA_HE}</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={cn('num font-semibold leading-none text-navy-900', small ? 'text-title' : 'text-[3rem]')}>{formatEventDayNumberHe(eventAnchor(event))}</span>
          <span className={cn('mt-1 font-medium text-pink-700', small ? 'text-caption' : 'text-body')}>{formatEventMonthHe(eventAnchor(event))}</span>
        </div>
      )}
    </div>
  );
}

/**
 * A boutique-style announcement: photo first, then date and time, title, a short teaser and a quiet
 * "לפרטים נוספים" link. The whole card is clickable (the link is stretched over it).
 */
export function EventCard({
  event,
  past = false,
  rsvp = null,
}: {
  event: EventView;
  past?: boolean;
  rsvp?: EventRsvpStatus | null;
}) {
  const when = eventWhenHe(event, true);
  const teaser = splitParagraphs(event.description)[0] ?? '';

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors duration-150 hover:border-navy-900/30 focus-within:border-navy-900/30">
      <EventCover
        event={event}
        sizes="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw"
        className="aspect-[16/10] w-full"
      />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className={cn('text-small font-semibold', past ? 'text-muted' : 'text-pink-700')}>
          <bdi>{when.date}</bdi>
          {when.time ? (
            <>
              <span aria-hidden="true"> · </span>
              <bdi className="num">{when.time}</bdi>
            </>
          ) : isDateOnlyEvent(event) ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>{EVENT_TIME_TBA_HE}</span>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-card font-semibold text-navy-900">{event.title}</h3>
          {rsvp ? (
            <Badge tone={rsvp === 'GOING' ? 'green' : 'neutral'}>{EVENT_RSVP_LABEL_HE[rsvp]}</Badge>
          ) : null}
        </div>
        {teaser ? <p className="line-clamp-3 text-small text-muted">{teaser}</p> : null}
        <p className="mt-1 flex items-center gap-1.5 text-caption text-muted">
          <MapPin className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.6} />
          {event.location}
        </p>
        <Link
          href={`/events/${event.id}`}
          className="mt-auto pt-3 text-small font-semibold text-navy-900 underline-offset-4 after:absolute after:inset-0 group-hover:underline"
        >
          לפרטים נוספים
          <span className="sr-only">: {event.title}</span>
        </Link>
      </div>
    </article>
  );
}
