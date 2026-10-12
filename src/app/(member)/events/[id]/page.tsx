import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventCover } from '@/components/events/event-card';
import { Badge } from '@/components/ui/card';
import { isEventPast, splitParagraphs } from '@/lib/domain/events';
import { nowMs } from '@/lib/now';
import { formatEventWhenHe } from '@/lib/time';
import { requireMember } from '@/server/auth';
import { getPublishedEvent } from '@/server/services/events';

export const metadata: Metadata = { title: 'אירועים בקהילה' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requireMember();

  // Drafts (and anything the database does not show this user) come back as null -> 404.
  const event = await getPublishedEvent(db, id);
  if (!event) notFound();

  const when = formatEventWhenHe(event.starts_at, event.ends_at);
  const past = isEventPast(event, nowMs());
  const paragraphs = splitParagraphs(event.description);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href="/events" className="inline-flex items-center gap-1 self-start text-small text-muted hover:text-ink">
        → חזרה לאירועים
      </Link>

      {event.image_url ? (
        <EventCover event={event} sizes="(min-width: 768px) 48rem, 100vw" preload className="aspect-[16/9] w-full rounded-card" />
      ) : null}

      <header className="flex flex-col gap-3">
        {past ? (
          <div>
            <Badge>אירוע שהסתיים</Badge>
          </div>
        ) : null}
        <h1 className="text-hero font-semibold tracking-tight sm:text-[2rem]">{event.title}</h1>
      </header>

      <dl className="grid gap-5 border-y border-line py-5 sm:grid-cols-3">
        <div>
          <dt className="text-caption font-medium text-muted">תאריך</dt>
          <dd className="mt-0.5 font-semibold text-navy-900">
            <bdi>{when.date}</bdi>
          </dd>
        </div>
        {when.time ? (
          <div>
            <dt className="text-caption font-medium text-muted">{event.ends_at ? 'שעות' : 'שעת התחלה'}</dt>
            <dd className="num mt-0.5 font-semibold text-navy-900">
              <bdi>{when.time}</bdi>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-caption font-medium text-muted">מיקום</dt>
          <dd className="mt-0.5 font-semibold text-navy-900">{event.location}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-4 text-body leading-relaxed text-ink">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
    </article>
  );
}
