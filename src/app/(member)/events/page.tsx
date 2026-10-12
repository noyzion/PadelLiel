import type { Metadata } from 'next';
import { EventCard } from '@/components/events/event-card';
import { PageHeader, SectionHeading } from '@/components/ui/card';
import { VENUE_NAME } from '@/lib/brand';
import { nowMs } from '@/lib/now';
import { requireMember } from '@/server/auth';
import { listPastEvents, listUpcomingEvents } from '@/server/services/events';

export const metadata: Metadata = { title: 'אירועים בקהילה' };

export default async function EventsPage() {
  const { db } = await requireMember();
  const now = new Date(nowMs());
  const [upcoming, past] = await Promise.all([listUpcomingEvents(db, now), listPastEvents(db, now)]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="אירועים בקהילה" description={`מה קורה אצלנו ב${VENUE_NAME}`} />

      <section aria-labelledby="events-upcoming" className="flex flex-col gap-4">
        <SectionHeading id="events-upcoming">אירועים קרובים</SectionHeading>
        {upcoming.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-6 py-10 text-center text-small text-muted">
            כרגע אין אירועים קרובים. כדאי להתעדכן כאן בהמשך.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="events-past" className="flex flex-col gap-4">
          <SectionHeading id="events-past">אירועי עבר</SectionHeading>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((event) => (
              <EventCard key={event.id} event={event} past />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
