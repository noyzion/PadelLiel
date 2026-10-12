import type { Metadata } from 'next';
import { SkillLevelBadge } from '@/components/domain/badges';
import { LogoutButton } from '@/components/logout-button';
import { ProfileForm } from '@/components/member/profile-form';
import { SubscriptionSummary } from '@/components/member/subscription-summary';
import { Badge, Card, SectionHeading } from '@/components/ui/card';
import { DataTable, Td, THead, Th, Tr } from '@/components/ui/data-table';
import { levelLabel } from '@/lib/domain/labels';
import { currentWeekStart, formatWeekRangeHe, shiftWeek } from '@/lib/time';
import { requireMember } from '@/server/auth';
import { getAllowance, getWeeklyUsage } from '@/server/services/booking';
import { getSettings, getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'פרופיל' };

export default async function ProfilePage() {
  const { db, userId, profile } = await requireMember();
  const week = currentWeekStart();
  const [allowance, usage, settings, levels, subs] = await Promise.all([
    getAllowance(db, userId, week),
    getWeeklyUsage(db, userId, shiftWeek(week, -7), week),
    getSettings(db),
    getSkillLevels(db),
    db.from('member_subscriptions').select('starts_on, ends_on, is_active').eq('member_id', userId).eq('is_active', true).maybeSingle(),
  ]);
  const sub = subs.data as { starts_on: string; ends_on: string | null; is_active: boolean } | null;
  const initial = profile.full_name.trim().charAt(0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span
            className="grid size-16 shrink-0 place-items-center rounded-full bg-navy-900 text-hero font-bold text-white"
            aria-hidden="true"
          >
            {initial || '·'}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-title font-bold">{profile.full_name || 'הפרופיל שלי'}</h1>
            <p className="truncate text-small text-muted" dir="ltr">
              {profile.email}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SkillLevelBadge label={levelLabel(profile.skill_level_code, levels)} />
          <Badge tone={allowance.has_active_subscription ? 'green' : 'amber'}>
            {allowance.has_active_subscription ? `מנוי: ${allowance.plan_name}` : 'אין מנוי פעיל'}
          </Badge>
          {sub?.ends_on ? (
            <span className="text-caption text-muted">
              בתוקף עד <span className="num">{sub.ends_on.split('-').reverse().join('.')}</span>
            </span>
          ) : null}
        </div>
        <p className="text-caption text-muted">הרמה והמנוי נקבעים על ידי הצוות שלנו.</p>
      </Card>

      <SubscriptionSummary allowance={allowance} title="המכסה השבוע" cutoffHours={settings.cancellation_cutoff_hours} />

      <section aria-labelledby="personal" className="flex flex-col gap-3">
        <SectionHeading id="personal">פרטים אישיים</SectionHeading>
        <Card>
          <ProfileForm fullName={profile.full_name} phone={profile.phone ?? ''} email={profile.email ?? ''} />
        </Card>
      </section>

      <section aria-labelledby="usage-history" className="flex flex-col gap-3">
        <SectionHeading id="usage-history">היסטוריית שימוש שבועית</SectionHeading>
        <DataTable caption="היסטוריית שימוש שבועית" className="min-w-0">
          <THead>
            <Tr>
              <Th>שבוע</Th>
              <Th className="text-center">מכסה</Th>
              <Th className="text-center">נוצלו</Th>
              <Th className="text-center">השתתפה</Th>
              <Th className="text-center">ביטול מאוחר</Th>
              <Th className="text-center">לא הגעת</Th>
            </Tr>
          </THead>
          <tbody>
            {usage.map((row) => (
              <Tr key={row.week_start}>
                <Td>{formatWeekRangeHe(row.week_start)}</Td>
                <Td className="text-center">{row.effective_limit}</Td>
                <Td className="text-center">{row.used}</Td>
                <Td className="text-center">{row.attended}</Td>
                <Td className="text-center">{row.late_cancellations}</Td>
                <Td className="text-center">{row.no_shows}</Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <div className="flex justify-center pt-2">
        <LogoutButton variant="secondary" />
      </div>
    </div>
  );
}
