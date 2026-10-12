import type { Metadata } from 'next';
import { NextSessionCard } from '@/components/member/next-session-card';
import { SessionPreview } from '@/components/member/session-preview';
import { SubscriptionSummary } from '@/components/member/subscription-summary';
import { ButtonLink } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { levelLabel } from '@/lib/domain/labels';
import { nowMs } from '@/lib/now';
import { currentMonthStart, currentWeekStart, greetingHe, shiftMonth } from '@/lib/time';
import { requireMember } from '@/server/auth';
import { getAllowance, getMyBookings, getWeekSchedule } from '@/server/services/booking';
import { getSettings, getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'בית' };

export default async function MemberHomePage() {
  const { db, userId, profile } = await requireMember();
  const week = currentWeekStart();
  const month = currentMonthStart();

  const [thisMonth, nextMonth, bookings, settings, levels, weekSessions] = await Promise.all([
    getAllowance(db, userId, month),
    getAllowance(db, userId, shiftMonth(month, 1)),
    getMyBookings(db),
    getSettings(db),
    getSkillLevels(db),
    getWeekSchedule(db, week),
  ]);

  const now = nowMs();
  const upcoming = bookings
    .filter((b) => b.can_cancel && new Date(b.starts_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const next = upcoming[0];
  const firstName = profile.full_name.split(' ')[0];
  const greeting = greetingHe(new Date(now));

  // Sessions this week she can book right now (the database already decided: block_reason === null).
  const available = weekSessions
    .filter((s) => s.status === 'PUBLISHED' && s.block_reason === null && !s.my_booking_id)
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title font-semibold sm:text-hero">
          {greeting.text}
          {firstName ? `, ${firstName}` : ''}        </h1>
        <p className="mt-1 text-small text-muted">
          {profile.skill_level_code ? `רמת משחק: ${levelLabel(profile.skill_level_code, levels)}` : 'המאמנת עדיין לא הגדירה לך רמה'}
        </p>
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.25fr_1fr] lg:items-start lg:gap-6">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <section aria-labelledby="next-booking" className="order-3 flex flex-col gap-3 lg:order-none">
            <SectionHeading id="next-booking">האימון הבא שלך</SectionHeading>
            {next ? (
              <NextSessionCard
                booking={next}
                levelLabel={levelLabel(next.skill_level_code, levels)}
                cutoffHours={settings.cancellation_cutoff_hours}
              />
            ) : (
              <Card className="flex flex-col gap-1 text-small text-muted">
                <p className="text-card font-semibold text-navy-900">עוד לא נרשמת לאימון קרוב</p>
                <p>אפשר לבחור אימון בלוח האימונים.</p>
              </Card>
            )}
          </section>

          <ButtonLink href="/schedule" size="lg" className="order-4 w-full lg:order-none">
            למציאת אימון
          </ButtonLink>

          {available.length > 0 ? (
            <section aria-labelledby="this-week" className="order-5 flex flex-col gap-3 lg:order-none">
              <SectionHeading id="this-week">אימונים פנויים השבוע</SectionHeading>
              <div className="flex flex-col gap-2">
                {available.map((s) => (
                  <SessionPreview key={s.id} session={s} levelLabel={levelLabel(s.skill_level_code, levels)} href={`/schedule?week=${week}`} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-1 lg:order-none">
            <SubscriptionSummary allowance={thisMonth} title="האימונים שלי החודש" cutoffHours={settings.cancellation_cutoff_hours} />
          </div>
          {nextMonth.has_active_subscription ? (
            <div className="order-6 lg:order-none">
              <SubscriptionSummary allowance={nextMonth} title="החודש הבא" cutoffHours={settings.cancellation_cutoff_hours} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
