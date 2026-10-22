import { MapPin } from 'lucide-react';
import { DeleteEventButton, PublishToggleButton } from '@/components/admin/event-actions';
import { EventCover } from '@/components/events/event-card';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { eventRsvpListSummary } from '@/lib/domain/event-rsvp';
import { WHEN_PUBLISH_NEEDS_DATE } from '@/lib/domain/event-when';
import { EVENT_STATUS_LABEL_HE, EVENT_TIME_TBA_HE, eventWhenHe, isDateOnlyEvent, isUndatedEvent, type EventView } from '@/lib/domain/events';
import type { EventRsvpRow } from '@/server/services/events';

/** One event in the admin list: thumbnail, key facts, RSVPs, and the management actions. */
export function EventRow({ event, rsvps = [] }: { event: EventView; rsvps?: EventRsvpRow[] }) {
  const when = eventWhenHe(event, true);
  const published = event.status === 'PUBLISHED';
  const summary = eventRsvpListSummary(rsvps);
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
          <Badge tone={published ? 'green' : 'amber'}>{EVENT_STATUS_LABEL_HE[event.status]}</Badge>
          {published ? <Badge tone={summary.going > 0 ? 'green' : 'neutral'}>{summary.going} מגיעות</Badge> : null}
        </div>
        <p className="text-small text-muted">
          <bdi>{when.date}</bdi>
          {when.time ? (
            <>
              {' · '}
              <bdi className="num">{when.time}</bdi>
            </>
          ) : null}
          {isDateOnlyEvent(event) ? <span> · {EVENT_TIME_TBA_HE}</span> : null}
        </p>
        <p className="flex items-center gap-1.5 text-caption text-muted">
          <MapPin className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.6} />
          {event.location}
        </p>
        {published ? <RsvpLine summary={summary} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={`/admin/events/${event.id}`} variant="secondary" size="sm">
          עריכה
        </ButtonLink>
        <ButtonLink href={`/admin/events/${event.id}/preview`} variant="ghost" size="sm">
          תצוגה מקדימה
        </ButtonLink>
        <PublishToggleButton
          eventId={event.id}
          status={event.status}
          blockedReason={isUndatedEvent(event) ? WHEN_PUBLISH_NEEDS_DATE : undefined}
        />
        <DeleteEventButton eventId={event.id} title={event.title} />
      </div>
    </li>
  );
}

function RsvpLine({
  summary,
}: {
  summary: { going: number; notGoing: number; goingNames: string };
}) {
  if (summary.going === 0 && summary.notGoing === 0) {
    return <p className="text-small text-muted">עדיין אין נרשמות לאירוע.</p>;
  }
  return (
    <p className="text-small text-navy-900">
      {summary.goingNames ? <span>מגיעות: {summary.goingNames}</span> : <span>אין מי שאישרה הגעה.</span>}
      {summary.notGoing > 0 ? (
        <span className="text-muted">
          {' · '}
          {summary.notGoing} לא יוכלו להגיע
        </span>
      ) : null}
    </p>
  );
}
