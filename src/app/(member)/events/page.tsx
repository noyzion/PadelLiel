import type { Metadata } from 'next';
import { EventCard } from '@/components/events/event-card';
import { PageHeader, SectionHeading } from '@/components/ui/card';
import { VENUE_NAME } from '@/lib/brand';
import { nowMs } from '@/lib/now';
import { currentMonthStart, formatMonthHe } from '@/lib/time';
import { requireMember } from '@/server/auth';
import { currentMonthRange, listPastEvents, listUpcomingEvents } from '@/server/services/events';

export const metadata: Metadata = { title: 'אירועים בקהילה' };

export default async function EventsPage() {
  const { db } = await requireMember();
  const now = new Date(nowMs());
  // Trainees only see the current month's events.
  const range = currentMonthRange(now);
  const [upcoming, past] = await Promise.all([
    listUpcomingEvents(db, now, range),
    listPastEvents(db, now, 60, range),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="אירועים בקהילה" description={`מה קורה אצלנו ב${VENUE_NAME} · ${formatMonthHe(currentMonthStart(now))}`} />

      <section aria-labelledby="events-upcoming" className="flex flex-col gap-4">
        <SectionHeading id="events-upcoming">אירועים קרובים</SectionHeading>
        {upcoming.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-6 py-10 text-center text-small text-muted">
            אין אירועים נוספים החודש. כדאי להתעדכן כאן בהמשך.
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
