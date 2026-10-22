import { Badge, Card, SectionHeading } from '@/components/ui/card';
import { EVENT_RSVP_LABEL_HE, type EventRsvpStatus } from '@/lib/domain/event-rsvp';
import { formatIsraeliPhone } from '@/lib/phone';
import type { EventRsvpRow } from '@/server/services/events';

export function EventRsvpRoster({ rows }: { rows: EventRsvpRow[] }) {
  const going = rows.filter((r) => r.status === 'GOING');
  const notGoing = rows.filter((r) => r.status === 'NOT_GOING');

  return (
    <section aria-labelledby="event-rsvp" className="flex flex-col gap-3">
      <SectionHeading id="event-rsvp" count={going.length}>
        אישורי הגעה
      </SectionHeading>
      <p className="text-small text-muted">
        {going.length} מגיעות
        {notGoing.length > 0 ? ` · ${notGoing.length} לא יוכלו להגיע` : null}
      </p>
      {rows.length === 0 ? (
        <p className="rounded-card border border-line bg-surface px-5 py-8 text-center text-small text-muted">
          עדיין אין אישורי הגעה לאירוע הזה.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <RsvpColumn title="מגיעות" tone="green" rows={going} empty="אף אחת עדיין לא אישרה." />
          <RsvpColumn title="לא מגיעות" tone="neutral" rows={notGoing} empty="אף אחת לא עדכנה שלא תוכל." />
        </div>
      )}
    </section>
  );
}

function RsvpColumn({
  title,
  tone,
  rows,
  empty,
}: {
  title: string;
  tone: 'green' | 'neutral';
  rows: EventRsvpRow[];
  empty: string;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-small font-semibold text-navy-900">{title}</h3>
        <Badge tone={tone}>{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-small text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.member_id} className="flex flex-col gap-0.5 border-t border-line pt-2 first:border-t-0 first:pt-0">
              <span className="font-semibold text-navy-900">{row.full_name}</span>
              {row.phone ? <span className="text-caption text-muted">{formatIsraeliPhone(row.phone)}</span> : null}
              <span className="sr-only">{EVENT_RSVP_LABEL_HE[row.status as EventRsvpStatus]}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
