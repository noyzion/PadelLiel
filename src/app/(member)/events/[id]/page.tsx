import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventDetails } from '@/components/events/event-details';
import { isEventPast } from '@/lib/domain/events';
import { nowMs } from '@/lib/now';
import { requireMember } from '@/server/auth';
import { getPublishedEvent } from '@/server/services/events';

export const metadata: Metadata = { title: 'אירועים בקהילה' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requireMember();

  // Drafts (and anything the database does not show this user) come back as null -> 404.
  // Admin previews live under /admin/events and never reach this page.
  const event = await getPublishedEvent(db, id);
  if (!event) notFound();

  return (
    <EventDetails
      event={event}
      past={isEventPast(event, nowMs())}
      before={
        <Link href="/events" className="inline-flex items-center gap-1 self-start text-small text-muted hover:text-ink">
          → חזרה לאירועים
        </Link>
      }
    />
  );
}
