import type { Metadata } from 'next';
import { SessionCard } from '@/components/member/session-card';
import { EmptyState, PageHeader } from '@/components/ui/card';
import { WeekNav } from '@/components/week-nav';
import { levelLabel } from '@/lib/domain/labels';
import type { ScheduleSession } from '@/lib/domain/types';
import { currentWeekStart, formatDateHe, parseWeekParam, weekdayNameHe } from '@/lib/time';
import { requireMember } from '@/server/auth';
import { getWeekSchedule } from '@/server/services/booking';
import { getSettings, getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'לוח אימונים' };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;
  const { db } = await requireMember();
  const weekStart = parseWeekParam(params.week);

  const [sessions, settings, levels] = await Promise.all([
    getWeekSchedule(db, weekStart),
    getSettings(db),
    getSkillLevels(db),
  ]);

  const byDay = new Map<string, ScheduleSession[]>();
  for (const s of sessions) byDay.set(s.session_date, [...(byDay.get(s.session_date) ?? []), s]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="לוח אימונים" description="בחרי אימון להרשמה" />
      <WeekNav basePath="/schedule" weekStart={weekStart} currentWeek={currentWeekStart()} />

      {sessions.length === 0 ? (
        <EmptyState title="עוד לא פורסמו אימונים לשבוע הזה" description="אימונים חדשים יופיעו כאן כשיפורסמו." />
      ) : (
        [...byDay.entries()].map(([date, daySessions]) => (
          <section key={date} aria-labelledby={`day-${date}`} className="flex flex-col gap-3">
            <h2 id={`day-${date}`} className="flex items-baseline gap-2 text-card font-semibold">
              <span>יום {weekdayNameHe(date)}</span>
              <span className="text-small font-medium text-muted">{formatDateHe(date).split(', ')[1]}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {daySessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  levelLabel={levelLabel(session.skill_level_code, levels)}
                  cutoffHours={settings.cancellation_cutoff_hours}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
