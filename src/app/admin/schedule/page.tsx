import type { Metadata } from 'next';
import { ScheduleTools } from '@/components/admin/schedule-tools';
import { SessionRow } from '@/components/admin/session-row';
import { WhatsAppPanel } from '@/components/admin/whatsapp-panel';
import { EmptyState, PageHeader } from '@/components/ui/card';
import { WeekNav } from '@/components/week-nav';
import { levelLabel } from '@/lib/domain/labels';
import type { ScheduleSession } from '@/lib/domain/types';
import { buildWeeklyWhatsAppMessage, scheduleLink } from '@/lib/domain/whatsapp';
import { getAppUrl } from '@/lib/env';
import { currentWeekStart, formatDateHe, parseWeekParam, weekDates } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { getWeekSchedule } from '@/server/services/booking';
import { getSettings, getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'לוח אימונים' };

export default async function AdminSchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;
  const { db } = await requireAdmin();
  const weekStart = parseWeekParam(params.week);

  const [sessions, settings, levels] = await Promise.all([getWeekSchedule(db, weekStart), getSettings(db), getSkillLevels(db)]);

  const byDay = new Map<string, ScheduleSession[]>();
  for (const date of weekDates(weekStart)) byDay.set(date, []);
  for (const s of sessions) byDay.get(s.session_date)?.push(s);

  const draftIds = sessions.filter((s) => s.status === 'DRAFT').map((s) => s.id);
  const link = scheduleLink(getAppUrl(), weekStart);
  const message = buildWeeklyWhatsAppMessage({
    weekStart,
    bookingUrl: link,
    cancellationCutoffHours: settings.cancellation_cutoff_hours,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="לוח אימונים" description="יצירה, פרסום וניהול של האימונים השבועיים" />
      <WeekNav basePath="/admin/schedule" weekStart={weekStart} currentWeek={currentWeekStart()} />

      <ScheduleTools
        key={weekStart}
        weekStart={weekStart}
        draftIds={draftIds}
        defaultSlots={settings.default_time_slots}
        defaultCapacity={settings.default_capacity}
        levels={levels}
        sessionCount={sessions.length}
      />

      {sessions.length === 0 ? (
        <EmptyState
          title="אין אימונים בשבוע הזה"
          description="אפשר ליצור אימונים לפי ימים ושעות, או לשכפל את השבוע הקודם."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {[...byDay.entries()]
            .filter(([, list]) => list.length > 0)
            .map(([date, list]) => (
              <section key={date} aria-labelledby={`day-${date}`} className="flex flex-col gap-2">
                <h2 id={`day-${date}`} className="text-small font-semibold text-muted">
                  {formatDateHe(date)}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((s) => (
                    <SessionRow key={s.id} session={s} showDate={false} levelLabel={levelLabel(s.skill_level_code, levels)} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}

      <WhatsAppPanel key={weekStart} message={message} link={link} />
    </div>
  );
}
