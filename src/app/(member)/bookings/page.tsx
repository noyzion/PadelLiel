import { MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { BookingStatusBadge, SkillLevelBadge } from '@/components/domain/badges';
import { CancelBookingButton } from '@/components/member/cancel-booking';
import { Alert, Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui/card';
import { VENUE_NAME } from '@/lib/brand';
import { levelLabel } from '@/lib/domain/labels';
import type { MyBooking } from '@/lib/domain/types';
import { nowMs } from '@/lib/now';
import { formatDateHe, formatHours, formatInstantHe, formatTimeRange } from '@/lib/time';
import { requireMember } from '@/server/auth';
import { getMyBookings } from '@/server/services/booking';
import { getSettings, getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'ההרשמות שלי' };

function statusNote(b: MyBooking, hours: string): string | null {
  switch (b.status) {
    case 'CANCELLED_EARLY':
      return 'בוטל בזמן – לא נספר במכסה החודשית';
    case 'CANCELLED_LATE':
      return b.counts_toward_allowance
        ? `בוטל פחות מ-${hours} שעות לפני האימון – נספר במכסה החודשית`
        : 'בוטל מאוחר, אבל האימון בוטל ע״י המאמנת ולכן לא נספר';
    case 'CANCELLED_BY_COACH':
      return 'האימון או ההרשמה בוטלו ע״י המאמנת – לא נספר במכסה';
    case 'NO_SHOW':
      return 'לא הגעת לאימון – נספר במכסה החודשית';
    default:
      return null;
  }
}

function BookingCard({
  b,
  levels,
  hours,
  cutoffHours,
  highlight = false,
}: {
  b: MyBooking;
  levels: { code: string; label_he: string }[];
  hours: string;
  cutoffHours: number;
  highlight?: boolean;
}) {
  const note = statusNote(b, hours);
  const label = `${formatDateHe(b.session_date)} · ${formatTimeRange(b.start_time, b.end_time)}`;
  return (
    <Card tone={highlight ? 'pink' : 'default'} className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="num text-card font-semibold text-navy-900">
            <bdi>{formatTimeRange(b.start_time, b.end_time)}</bdi>
          </p>
          <p className="text-small text-muted">{formatDateHe(b.session_date)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <BookingStatusBadge status={b.status} />
          <SkillLevelBadge label={levelLabel(b.skill_level_code, levels)} />
        </div>
      </div>
      <p className="flex items-center gap-2 text-caption text-muted">
        <MapPin className="size-4 shrink-0 text-ocean-700" aria-hidden="true" />
        {VENUE_NAME}
      </p>
      {note ? <p className="text-small text-muted">{note}</p> : null}
      {b.can_cancel ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-muted">
            ביטול שמחזיר למכסה עד <span className="num font-semibold text-navy-900">{formatInstantHe(b.cancellation_deadline)}</span>
          </p>
          <CancelBookingButton bookingId={b.booking_id} isLateWindow={b.is_late_window} cutoffHours={cutoffHours} label={label} />
        </div>
      ) : null}
    </Card>
  );
}

export default async function MyBookingsPage() {
  const { db } = await requireMember();
  const [bookings, settings, levels] = await Promise.all([getMyBookings(db), getSettings(db), getSkillLevels(db)]);
  const hours = formatHours(settings.cancellation_cutoff_hours);
  const now = nowMs();

  const isCancelled = (b: MyBooking) => b.status.startsWith('CANCELLED');
  const upcoming = bookings
    .filter((b) => b.status === 'CONFIRMED' && new Date(b.starts_at).getTime() > now && b.session_status === 'PUBLISHED')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const cancelled = bookings.filter(isCancelled);
  const history = bookings.filter((b) => !isCancelled(b) && !upcoming.includes(b));

  const sections: { id: string; title: string; items: MyBooking[]; empty: string }[] = [
    { id: 'upcoming', title: 'אימונים קרובים', items: upcoming, empty: 'אין הרשמות קרובות.' },
    { id: 'history', title: 'אימונים קודמים', items: history, empty: 'עדיין אין אימונים קודמים.' },
    { id: 'cancelled', title: 'הרשמות שבוטלו', items: cancelled, empty: 'לא בוטלו הרשמות.' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="ההרשמות שלי" />
      {bookings.length === 0 ? (
        <EmptyState title="עדיין לא נרשמת לאף אימון" description="בלוח האימונים אפשר לבחור אימונים לשבוע הקרוב." />
      ) : (
        <>
          <Alert tone="blue" title="מדיניות ביטול">
            ביטול של לפחות {hours} שעות לפני האימון מחזיר אותו למכסה החודשית. ביטול מאוחר יותר משחרר את המקום, אבל האימון ממשיך להיספר במכסה.
          </Alert>
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={`sec-${s.id}`} className="flex flex-col gap-3">
              <SectionHeading id={`sec-${s.id}`} count={s.items.length}>
                {s.title}
              </SectionHeading>
              {s.items.length === 0 ? (
                <p className="text-small text-muted">{s.empty}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {s.items.map((b, i) => (
                    <BookingCard
                      key={b.booking_id}
                      b={b}
                      levels={levels}
                      hours={hours}
                      cutoffHours={settings.cancellation_cutoff_hours}
                      highlight={s.id === 'upcoming' && i === 0}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
