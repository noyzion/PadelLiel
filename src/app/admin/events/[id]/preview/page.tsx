import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublishToggleButton } from '@/components/admin/event-actions';
import { PreviewBar } from '@/components/admin/preview-bar';
import { EventDetails } from '@/components/events/event-details';
import { ButtonLink } from '@/components/ui/button';
import { WHEN_PUBLISH_NEEDS_START } from '@/lib/domain/event-when';
import { isEventPast } from '@/lib/domain/events';
import { nowMs } from '@/lib/now';
import { requireAdmin } from '@/server/auth';
import { getEvent } from '@/server/services/events';

export const metadata: Metadata = { title: 'תצוגה מקדימה' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Preview of a SAVED event (draft or published) exactly as trainees see it. Read-only and admin-only:
 * the admin's own session reads the row (RLS lets admins see drafts), nothing is published or changed.
 */
export default async function PreviewEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requireAdmin();

  const event = await getEvent(db, id);
  if (!event) notFound();
  const published = event.status === 'PUBLISHED';

  return (
    <div>
      <PreviewBar
        description={
          published ? 'האירוע מפורסם, וכך הוא מוצג למתאמנות.' : 'האירוע עדיין לא פורסם ולא מוצג למתאמנות.'
        }
      >
        <ButtonLink href={`/admin/events/${event.id}`} variant="secondary" size="sm">
          חזרה לעריכה
        </ButtonLink>
        {published ? null : (
          <PublishToggleButton
            eventId={event.id}
            status="DRAFT"
            blockedReason={event.starts_at ? undefined : WHEN_PUBLISH_NEEDS_START}
          />
        )}
      </PreviewBar>
      <EventDetails event={event} past={isEventPast(event, nowMs())} />
    </div>
  );
}
