import type { Metadata } from 'next';
import { EventRow } from '@/components/admin/event-row';
import { ButtonLink } from '@/components/ui/button';
import { Alert, PageHeader, SectionHeading } from '@/components/ui/card';
import { eventAnchor, isEventPast, type EventView } from '@/lib/domain/events';
import { nowMs } from '@/lib/now';
import { requireAdmin } from '@/server/auth';
import { listAllEventRsvps, listAllEvents, type EventRsvpRow } from '@/server/services/events';

export const metadata: Metadata = { title: 'אירועים בקהילה' };

function Section({
  id,
  title,
  events,
  empty,
  rsvpsByEvent,
}: {
  id: string;
  title: string;
  events: EventView[];
  empty: string;
  rsvpsByEvent: Map<string, EventRsvpRow[]>;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <SectionHeading id={id} count={events.length}>
        {title}
      </SectionHeading>
      {events.length === 0 ? (
        <p className="text-small text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => (
            <EventRow key={e.id} event={e} rsvps={rsvpsByEvent.get(e.id) ?? []} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminEventsPage() {
  const { db } = await requireAdmin();
  const [events, rsvpsByEvent] = await Promise.all([listAllEvents(db), listAllEventRsvps(db)]);
  const now = nowMs();

  // Drafts read like a calendar: earliest date first.
  const drafts = events.filter((e) => e.status === 'DRAFT').sort((a, b) => eventAnchor(a).localeCompare(eventAnchor(b)));
  const published = events.filter((e) => e.status === 'PUBLISHED');
  // Upcoming: nearest first. Past: newest first (the list arrives newest first).
  const upcoming = published.filter((e) => !isEventPast(e, now)).sort((a, b) => eventAnchor(a).localeCompare(eventAnchor(b)));
  const past = published.filter((e) => isEventPast(e, now));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="אירועים בקהילה"
        description="הודעות על אירועים במרכז הטניס, שהמתאמנות רואות בלשונית ״אירועים בקהילה״"
        actions={
          <>
            <ButtonLink href="/admin/events/import" variant="secondary">
              ייבוא אירועי שנה
            </ButtonLink>
            <ButtonLink href="/admin/events/new">אירוע חדש</ButtonLink>
          </>
        }
      />
      <Alert tone="blue">
        המתאמנות יכולות לאשר הגעה. אישור לאירוע לא נספר במכסת האימונים ואין בו תשלום.
      </Alert>
      <Section id="events-drafts" title="טיוטות" events={drafts} empty="אין טיוטות." rsvpsByEvent={rsvpsByEvent} />
      <Section
        id="events-upcoming"
        title="מפורסמים · קרובים"
        events={upcoming}
        empty="אין אירועים קרובים שפורסמו."
        rsvpsByEvent={rsvpsByEvent}
      />
      <Section id="events-past" title="אירועי עבר" events={past} empty="אין אירועי עבר." rsvpsByEvent={rsvpsByEvent} />
    </div>
  );
}
