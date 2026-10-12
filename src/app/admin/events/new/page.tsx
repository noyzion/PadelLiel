import type { Metadata } from 'next';
import { EventForm } from '@/components/admin/event-form';
import { BackLink } from '@/components/admin/session-panels';
import { PageHeader } from '@/components/ui/card';
import { DEFAULT_EVENT_LOCATION } from '@/lib/domain/events';
import { requireAdmin } from '@/server/auth';

export const metadata: Metadata = { title: 'אירוע חדש' };

export default async function NewEventPage() {
  await requireAdmin();
  return (
    <EventForm
      mode={{ type: 'create' }}
      header={
        <div>
          <BackLink href="/admin/events">חזרה לאירועים</BackLink>
          <PageHeader title="אירוע חדש" />
        </div>
      }
      initial={{ title: '', description: '', startsAt: '', endsAt: '', location: DEFAULT_EVENT_LOCATION, status: 'DRAFT', imageUrl: null }}
    />
  );
}
