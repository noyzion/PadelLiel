import { MapPin } from 'lucide-react';
import { DeleteEventButton, PublishToggleButton } from '@/components/admin/event-actions';
import { EventCover } from '@/components/events/event-card';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { EVENT_STATUS_LABEL_HE, type EventView } from '@/lib/domain/events';
import { formatEventWhenHe } from '@/lib/time';

/** One event in the admin list: thumbnail, key facts, and the management actions. */
export function EventRow({ event }: { event: EventView }) {
  const when = formatEventWhenHe(event.starts_at, event.ends_at, true);
  return (
    <li className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center">
      <EventCover
        event={event}
        small
        sizes="9rem"
        className="aspect-[16/10] w-full shrink-0 rounded-control sm:w-36"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-card font-semibold text-navy-900">{event.title}</h3>
          <Badge tone={event.status === 'PUBLISHED' ? 'green' : 'amber'}>{EVENT_STATUS_LABEL_HE[event.status]}</Badge>
        </div>
        <p className="text-small text-muted">
          <bdi>{when.date}</bdi>
          {when.time ? (
            <>
              {' · '}
              <bdi className="num">{when.time}</bdi>
            </>
          ) : null}
        </p>
        <p className="flex items-center gap-1.5 text-caption text-muted">
          <MapPin className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.6} />
          {event.location}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={`/admin/events/${event.id}`} variant="secondary" size="sm">
          עריכה
        </ButtonLink>
        <ButtonLink href={`/admin/events/${event.id}/preview`} variant="ghost" size="sm">
          תצוגה מקדימה
        </ButtonLink>
        <PublishToggleButton eventId={event.id} status={event.status} />
        <DeleteEventButton eventId={event.id} title={event.title} />
      </div>
    </li>
  );
}
