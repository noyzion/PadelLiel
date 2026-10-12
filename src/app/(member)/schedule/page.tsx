import type { Metadata } from 'next';
import { SessionCard } from '@/components/member/session-card';
import { Alert, EmptyState, PageHeader } from '@/components/ui/card';
import { WeekNav } from '@/components/week-nav';
import { levelLabel } from '@/lib/domain/labels';
import type { ScheduleSession } from '@/lib/domain/types';
import { currentWeekStart, formatDateHe, parseWeekParam, weekdayNameHe } from '@/lib/time';
import { requireMember } from '@/server/auth';
import { getAllowance, getWeekSchedule } from '@/server/services/booking';
import { getSettings, getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'לוח אימונים' };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;
  const { db, userId } = await requireMember();
  const weekStart = parseWeekParam(params.week);

  const [sessions, allowance, settings, levels] = await Promise.all([
    getWeekSchedule(db, weekStart),
    getAllowance(db, userId, weekStart),
    getSettings(db),
    getSkillLevels(db),
  ]);

  const byDay = new Map<string, ScheduleSession[]>();
  for (const s of sessions) byDay.set(s.session_date, [...(byDay.get(s.session_date) ?? []), s]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="בואי לבחור את הבוקר שלך" description="לוח האימונים השבועי" />
      <WeekNav basePath="/schedule" weekStart={weekStart} currentWeek={currentWeekStart()} />

      {!allowance.has_active_subscription ? (
        <Alert tone="amber" title="אין מנוי פעיל לשבוע הזה">
          אפשר לראות את האימונים, אבל ההרשמה דורשת מנוי פעיל. פני לצוות שלנו.
        </Alert>
      ) : allowance.remaining === 0 ? (
        <Alert tone="amber" title="מימשת את מכסת האימונים השבועית שלך">
          במנוי שלך ({allowance.plan_name}) יש {allowance.effective_limit} אימונים בשבוע, וכולם שמורים או נוצלו. ביטול בזמן יחזיר אימון
          למכסה.
        </Alert>
      ) : (
        <Alert tone="blue">
          נותרו לך <strong className="num">{allowance.remaining}</strong> מתוך <span className="num">{allowance.effective_limit}</span> אימונים בשבוע הזה.
        </Alert>
      )}

      {sessions.length === 0 ? (
        <EmptyState title="עוד לא פורסמו אימונים לשבוע הזה" description="נתראה בקרוב על המגרש." />
      ) : (
        [...byDay.entries()].map(([date, daySessions]) => (
          <section key={date} aria-labelledby={`day-${date}`} className="flex flex-col gap-3">
            <h2 id={`day-${date}`} className="flex items-baseline gap-2 text-card font-bold">
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
