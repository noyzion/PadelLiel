import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EventForm } from '@/components/admin/event-form';
import { EventRsvpRoster } from '@/components/admin/event-rsvp-roster';
import { BackLink } from '@/components/admin/session-panels';
import { Badge, PageHeader } from '@/components/ui/card';
import { EVENT_STATUS_LABEL_HE } from '@/lib/domain/events';
import { instantToIsraelLocal } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { getEvent, listEventRsvps } from '@/server/services/events';

export const metadata: Metadata = { title: 'עריכת אירוע' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requireAdmin();

  const event = await getEvent(db, id);
  if (!event) notFound();
  const rsvps = event.status === 'PUBLISHED' ? await listEventRsvps(db, event.id) : [];

  return (
    <div className="flex flex-col gap-10">
      <EventForm
        // A fresh form (and fresh state) whenever the saved event changes.
        key={event.updated_at}
        mode={{ type: 'edit', eventId: event.id, title: event.title }}
        header={
          <div>
            <BackLink href="/admin/events">חזרה לאירועים</BackLink>
            <PageHeader title="עריכת אירוע" />
            <Badge tone={event.status === 'PUBLISHED' ? 'green' : 'amber'}>{EVENT_STATUS_LABEL_HE[event.status]}</Badge>
          </div>
        }
        initial={{
          title: event.title,
          description: event.description,
          // A date-only draft (no clock time yet) opens with just its date(s); no time is filled in.
          startsAt: event.starts_at ? instantToIsraelLocal(event.starts_at) : (event.date_start ?? ''),
          endsAt: event.ends_at ? instantToIsraelLocal(event.ends_at) : (event.date_end ?? ''),
          location: event.location,
          status: event.status,
          imageUrl: event.image_url,
        }}
      />
      {event.status === 'PUBLISHED' ? <EventRsvpRoster rows={rsvps} /> : null}
    </div>
  );
}
