import { nowMs } from '@/lib/now';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SessionRow } from '@/components/admin/session-row';
import { ButtonLink } from '@/components/ui/button';
import { PendingLink } from '@/components/ui/pending-link';
import { BookingStatusBadge } from '@/components/domain/badges';
import { Alert, Card, EmptyState, PageHeader, ProgressBar, SectionHeading, Stat } from '@/components/ui/card';
import { COACH_NAME } from '@/lib/brand';
import { levelLabel } from '@/lib/domain/labels';
import type { WeekStats } from '@/lib/domain/stats';
import { currentWeekStart, formatDateHe, formatInstantHe, formatTimeRange, formatWeekRangeHe, greetingHe } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { getDashboard } from '@/server/services/dashboard';
import { getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'דשבורד' };

function WeekOccupancy({ title, stats }: { title: string; stats: WeekStats }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-card font-semibold">{title}</h3>
        <span className="text-caption text-muted">{formatWeekRangeHe(stats.weekStart)}</span>
      </div>
      <p className="num text-hero font-semibold text-navy-900">{stats.occupancyPercent}%</p>
      <ProgressBar value={stats.occupied} max={Math.max(stats.capacity, 1)} label={`תפוסה ${title}`} />
      <p className="text-caption text-muted">
        {stats.occupied} מתוך {stats.capacity} מקומות · {stats.sessions} אימונים · {stats.fullSessions} מלאים · {stats.waiting} בהמתנה
      </p>
    </Card>
  );
}

export default async function AdminDashboardPage() {
  const { db, profile } = await requireAdmin();
  const week = currentWeekStart();
  const [data, levels] = await Promise.all([getDashboard(db, week), getSkillLevels(db)]);

  const now = nowMs();
  const greeting = greetingHe(new Date(now));
  const firstName =
    profile.full_name?.trim().split(/\s+/)[0] || profile.email?.split('@')[0] || COACH_NAME;
  const upcoming = [...data.thisWeek, ...data.nextWeek]
    .filter((s) => s.status === 'PUBLISHED' && new Date(s.starts_at).getTime() > now)
    .slice(0, 8);
  const drafts = [...data.thisWeek, ...data.nextWeek].filter((s) => s.status === 'DRAFT').length;
  const { thisWeek, nextWeek } = data.stats;
  const freeSpots = (thisWeek.capacity - thisWeek.occupied) + (nextWeek.capacity - nextWeek.occupied);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting.text}, ${firstName}`}
        description="תמונת מצב של האימונים הקרובים"
        actions={
          <>
            <ButtonLink href="/admin/schedule" size="sm">
              ניהול לוח אימונים
            </ButtonLink>
            <ButtonLink href="/admin/members" variant="secondary" size="sm">
              מתאמנות
            </ButtonLink>
          </>
        }
      />

      {data.pendingApprovals > 0 ? (
        <Alert tone="amber" title={`${data.pendingApprovals} מתאמנות ממתינות לאישור`}>
          <Link href="/admin/members?status=pending" className="font-semibold underline underline-offset-4">
            לאישור הבקשות
          </Link>
        </Alert>
      ) : null}
      {drafts > 0 ? (
        <Alert tone="blue" title={`${drafts} אימונים בטיוטה`}>
          טיוטות לא נראות למתאמנות עד לפרסום.{' '}
          <Link href="/admin/schedule" className="font-semibold underline underline-offset-4">
            לפרסום
          </Link>
        </Alert>
      ) : null}

      <section aria-label="סיכום" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="אימונים השבוע" value={thisWeek.sessions} hint={`${nextWeek.sessions} בשבוע הבא`} />
        <Stat label="רשומות השבוע" value={thisWeek.occupied} hint={`מתוך ${thisWeek.capacity} מקומות`} tone="rose" />
        <Stat label="מקומות פנויים" value={freeSpots} hint="השבוע ושבוע הבא" />
        <Stat label="אימונים מלאים" value={thisWeek.fullSessions + nextWeek.fullSessions} hint={`${thisWeek.waiting + nextWeek.waiting} ממתינות`} />
      </section>

      <section aria-label="תפוסה שבועית" className="grid gap-3 md:grid-cols-2">
        <WeekOccupancy title="תפוסה השבוע" stats={thisWeek} />
        <WeekOccupancy title="תפוסה שבוע הבא" stats={nextWeek} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="upcoming" className="flex flex-col gap-3">
          <SectionHeading id="upcoming">אימונים קרובים</SectionHeading>
          {upcoming.length === 0 ? (
            <EmptyState
              title="אין אימונים מפורסמים"
              description="צרי אימונים לשבוע הקרוב ופרסמי אותם."
              action={<ButtonLink href="/admin/schedule" size="sm">ליצירת אימונים</ButtonLink>}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {upcoming.map((s) => (
                <SessionRow key={s.id} session={s} levelLabel={levelLabel(s.skill_level_code, levels)} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="recent-cancel" className="flex flex-col gap-3">
          <SectionHeading id="recent-cancel">ביטולים אחרונים</SectionHeading>
          {data.recentCancellations.length === 0 ? (
            <p className="text-small text-muted">אין ביטולים לאחרונה.</p>
          ) : (
            <Card className="divide-y divide-line p-0">
              {data.recentCancellations.map((c) => (
                <PendingLink key={c.booking_id} href={`/admin/sessions/${c.session_id}`} className="flex flex-col gap-1 p-4 hover:bg-pink-50 active:bg-pink-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.member_name}</span>
                    <BookingStatusBadge status={c.status} />
                  </div>
                  <span className="text-caption text-muted">
                    {formatDateHe(c.session_date)} · {formatTimeRange(c.start_time, c.end_time)}
                    {c.cancelled_at ? ` · בוטל ${formatInstantHe(c.cancelled_at)}` : ''}
                  </span>
                </PendingLink>
              ))}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
