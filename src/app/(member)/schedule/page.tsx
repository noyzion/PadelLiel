import type { Metadata } from 'next';
import { SessionCard } from '@/components/member/session-card';
import { DayTabs, type DayTab } from '@/components/member/day-tabs';
import { EmptyState, PageHeader } from '@/components/ui/card';
import { WeekNav } from '@/components/week-nav';
import { levelLabel } from '@/lib/domain/labels';
import { nowMs } from '@/lib/now';
import {
  currentWeekStart,
  formatDayMonth,
  israelToday,
  parseWeekParam,
  shiftWeek,
  weekDates,
  weekdayNameHe,
} from '@/lib/time';
import { requireMember } from '@/server/auth';
import { getWeekSchedule, weekHasSessions } from '@/server/services/booking';
import { getSettings, getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'לוח אימונים' };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;
  const { db } = await requireMember();
  // Members only see this week, plus next week once its sessions have been published.
  const thisWeek = currentWeekStart();
  const nextWeek = shiftWeek(thisWeek, 1);
  const requestedNext = parseWeekParam(params.week) === nextWeek;

  // Default view: this week's schedule + a cheap "does next week exist?" check.
  // Opening next week still loads both, so an empty next week can fall back to this week.
  const thisWeekSessionsP = getWeekSchedule(db, thisWeek);
  const settingsP = getSettings(db);
  const levelsP = getSkillLevels(db);

  let nextWeekOpen: boolean;
  let showNextWeek: boolean;
  let weekStart: string;
  let sessions: Awaited<typeof thisWeekSessionsP>;
  let settings: Awaited<typeof settingsP>;
  let levels: Awaited<typeof levelsP>;

  if (requestedNext) {
    const [thisWeekSessions, nextWeekSessions, s, l] = await Promise.all([
      thisWeekSessionsP,
      getWeekSchedule(db, nextWeek),
      settingsP,
      levelsP,
    ]);
    nextWeekOpen = nextWeekSessions.length > 0;
    showNextWeek = nextWeekOpen;
    weekStart = showNextWeek ? nextWeek : thisWeek;
    sessions = showNextWeek ? nextWeekSessions : thisWeekSessions;
    settings = s;
    levels = l;
  } else {
    const [thisWeekSessions, hasNext, s, l] = await Promise.all([
      thisWeekSessionsP,
      weekHasSessions(db, nextWeek),
      settingsP,
      levelsP,
    ]);
    nextWeekOpen = hasNext;
    showNextWeek = false;
    weekStart = thisWeek;
    sessions = thisWeekSessions;
    settings = s;
    levels = l;
  }

  const now = nowMs();
  const today = israelToday(new Date(now));
  const dates = weekDates(weekStart);

  const days: DayTab[] = dates.map((date) => {
    const daySessions = sessions.filter((s) => s.session_date === date);
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
        />
      )),
    };
  });

  // Open on the first day from today onward that has sessions (any day of a future week counts as
  // upcoming); fall back to the first day with sessions, then to the first day of the week.
  const defaultDate =
    days.find((d) => d.sessionCount > 0 && d.date >= today)?.date ??
    days.find((d) => d.sessionCount > 0)?.date ??
    days[0].date;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="לוח אימונים" description="בחרי יום ואז אימון להרשמה" />
      <WeekNav
        basePath="/schedule"
        weekStart={weekStart}
        currentWeek={thisWeek}
        canGoPrev={showNextWeek}
        canGoNext={nextWeekOpen && !showNextWeek}
      />

      {sessions.length === 0 ? (
        <EmptyState title="עוד לא פורסמו אימונים לשבוע הזה" description="אימונים חדשים יופיעו כאן כשיפורסמו." />
      ) : (
        <DayTabs key={weekStart} days={days} defaultDate={defaultDate} />
      )}
    </div>
  );
}
