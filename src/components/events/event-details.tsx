import type { ReactNode } from 'react';
import { EventCover } from '@/components/events/event-card';
import { Badge } from '@/components/ui/card';
import { eventWhenHe, splitParagraphs, type EventView } from '@/lib/domain/events';

/**
 * The event details exactly as trainees see them. Shared by the trainee page (`/events/[id]`) and the
 * admin previews, so a preview can never drift from the real page.
 *
 * `before` is rendered above the cover (the trainee page puts its back link there).
 */
export function EventDetails({
  event,
  past,
  before,
  preloadImage = true,
}: {
  event: EventView;
  /** Whether the event is over (shows the "אירוע שהסתיים" badge). */
  past: boolean;
  before?: ReactNode;
  preloadImage?: boolean;
}) {
  const when = eventWhenHe(event);
  const paragraphs = splitParagraphs(event.description);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      {before}

      {event.image_url ? (
        <EventCover
          event={event}
          sizes="(min-width: 768px) 48rem, 100vw"
          preload={preloadImage}
          className="aspect-[16/9] w-full rounded-card"
        />
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
