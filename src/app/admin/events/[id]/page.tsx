import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EventForm } from '@/components/admin/event-form';
import { BackLink } from '@/components/admin/session-panels';
import { Badge, PageHeader } from '@/components/ui/card';
import { EVENT_STATUS_LABEL_HE } from '@/lib/domain/events';
import { instantToIsraelLocal } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { getEvent } from '@/server/services/events';

export const metadata: Metadata = { title: 'עריכת אירוע' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requireAdmin();

  const event = await getEvent(db, id);
  if (!event) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-2">
      <div>
        <BackLink href="/admin/events">חזרה לאירועים</BackLink>
        <PageHeader title="עריכת אירוע" />
        <Badge tone={event.status === 'PUBLISHED' ? 'green' : 'amber'}>{EVENT_STATUS_LABEL_HE[event.status]}</Badge>
      </div>
      <div className="mt-4">
        <EventForm
          // A fresh form (and fresh state) whenever the saved event changes.
          key={event.updated_at}
          mode={{ type: 'edit', eventId: event.id, title: event.title }}
          initial={{
            title: event.title,
            description: event.description,
            startsAt: instantToIsraelLocal(event.starts_at),
            endsAt: event.ends_at ? instantToIsraelLocal(event.ends_at) : '',
            location: event.location,
            status: event.status,
            imageUrl: event.image_url,
          }}
        />
      </div>
    </div>
  );
}
