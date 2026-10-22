import type { Metadata } from 'next';
import { SessionCard } from '@/components/member/session-card';
import { DayTabs, type DayTab } from '@/components/member/day-tabs';
import { EmptyState, PageHeader } from '@/components/ui/card';
import { WeekNav } from '@/components/week-nav';
import { levelLabel } from '@/lib/domain/labels';
import { nowMs } from '@/lib/now';
import {
  currentMonthStart,
  currentWeekStart,
  formatDayMonth,
  israelToday,
  parseWeekParam,
  shiftWeek,
  upcomingWeekDates,
  weekdayNameHe,
} from '@/lib/time';
import { requireMember } from '@/server/auth';
import { getAllowance, getWeekSchedule, weekHasSessions } from '@/server/services/booking';
import { getSettings, getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'לוח אימונים' };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;
  const { db, userId } = await requireMember();
  // Members only see this week, plus next week once its sessions have been published.
  const thisWeek = currentWeekStart();
  const nextWeek = shiftWeek(thisWeek, 1);
  const requestedNext = parseWeekParam(params.week) === nextWeek;

  // Default view: this week's schedule + a cheap "does next week exist?" check.
  // Opening next week still loads both, so an empty next week can fall back to this week.
  const thisWeekSessionsP = getWeekSchedule(db, thisWeek);
  const settingsP = getSettings(db);
  const levelsP = getSkillLevels(db);
  const allowanceP = getAllowance(db, userId, currentMonthStart());

  let nextWeekOpen: boolean;
  let showNextWeek: boolean;
  let weekStart: string;
  let sessions: Awaited<typeof thisWeekSessionsP>;
  let settings: Awaited<typeof settingsP>;
  let levels: Awaited<typeof levelsP>;
  let trialAvailable: boolean;

  if (requestedNext) {
    const [thisWeekSessions, nextWeekSessions, s, l, allowance] = await Promise.all([
      thisWeekSessionsP,
      getWeekSchedule(db, nextWeek),
      settingsP,
      levelsP,
      allowanceP,
    ]);
    const thisWeekVisible = thisWeekSessions.filter((session) => session.status !== 'CANCELLED');
    const nextWeekVisible = nextWeekSessions.filter((session) => session.status !== 'CANCELLED');
    nextWeekOpen = nextWeekVisible.length > 0;
    showNextWeek = nextWeekOpen;
    weekStart = showNextWeek ? nextWeek : thisWeek;
    sessions = showNextWeek ? nextWeekVisible : thisWeekVisible;
    settings = s;
    levels = l;
    trialAvailable = allowance.trial_available;
  } else {
    const [thisWeekSessions, hasNext, s, l, allowance] = await Promise.all([
      thisWeekSessionsP,
      weekHasSessions(db, nextWeek),
      settingsP,
      levelsP,
      allowanceP,
    ]);
    nextWeekOpen = hasNext;
    showNextWeek = false;
    weekStart = thisWeek;
    sessions = thisWeekSessions.filter((session) => session.status !== 'CANCELLED');
    settings = s;
    levels = l;
    trialAvailable = allowance.trial_available;
  }

  const now = nowMs();
  const today = israelToday(new Date(now));
  const dates = upcomingWeekDates(weekStart, today);
  const upcomingSessions = sessions.filter((s) => new Date(s.starts_at).getTime() > now);

  const days: DayTab[] = dates.map((date) => {
    const daySessions = upcomingSessions.filter((s) => s.session_date === date);
    return {
      date,
      weekday: weekdayNameHe(date),
      dayNumber: String(Number(date.slice(8, 10))),
      dayMonth: formatDayMonth(date),
      sessionCount: daySessions.length,
      isToday: date === today,
      content: daySessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          levelLabel={levelLabel(session.skill_level_code, levels)}
          cutoffHours={settings.cancellation_cutoff_hours}
          nowMs={now}
          trialAvailable={trialAvailable}
        />
      )),
    };
  });

  // Open on the first remaining day that has a session; otherwise the first remaining day.
  const defaultDate = days.find((d) => d.sessionCount > 0)?.date ?? days[0]?.date;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="לוח אימונים"
        description={trialAvailable ? 'יש לך אימון ניסיון אחד בחינם. בחרי איזה מועד שתרצי.' : 'בחרי יום ואז אימון להרשמה'}
      />
      <WeekNav
        basePath="/schedule"
        weekStart={weekStart}
        currentWeek={thisWeek}
        canGoPrev={showNextWeek}
        canGoNext={nextWeekOpen && !showNextWeek}
      />

      {sessions.length === 0 ? (
        <EmptyState title="עוד לא פורסמו אימונים לשבוע הזה" description="אימונים חדשים יופיעו כאן כשיפורסמו." />
      ) : defaultDate ? (
        <DayTabs key={weekStart} days={days} defaultDate={defaultDate} />
      ) : (
        <EmptyState title="אין אימונים מהיום והלאה" description="אימונים חדשים יופיעו כאן כשיפורסמו." />
      )}
    </div>
  );
}
