import type { Metadata } from 'next';
import { SkillLevelBadge } from '@/components/domain/badges';
import { LogoutButton } from '@/components/logout-button';
import { ChangePasswordForm } from '@/components/member/change-password-form';
import { ProfileForm } from '@/components/member/profile-form';
import { SubscriptionSummary } from '@/components/member/subscription-summary';
import { NotificationSettings } from '@/components/notifications/notification-settings';
import { Badge, Card, SectionHeading } from '@/components/ui/card';
import { DataTable, Td, THead, Th, Tr } from '@/components/ui/data-table';
import { levelLabel } from '@/lib/domain/labels';
import { getVapidPublicKey } from '@/lib/env';
import { formatIsraeliPhone } from '@/lib/phone';
import { currentMonthStart, formatMonthHe, shiftMonth } from '@/lib/time';
import { requireMember } from '@/server/auth';
import { getAllowance, getMonthlyUsage } from '@/server/services/booking';
import { getDeviceEndpoints, getPreferences } from '@/server/services/notifications';
import { getSettings, getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'פרופיל' };

export default async function ProfilePage() {
  const { db, userId, profile } = await requireMember();
  const month = currentMonthStart();
  const [allowance, usage, settings, levels, subs, preferences, deviceEndpoints] = await Promise.all([
    getAllowance(db, userId, month),
    getMonthlyUsage(db, userId, shiftMonth(month, -5), month),
    getSettings(db),
    getSkillLevels(db),
    db.from('member_subscriptions').select('starts_on, ends_on, is_active').eq('member_id', userId).eq('is_active', true).maybeSingle(),
    getPreferences(db),
    getDeviceEndpoints(db),
  ]);
  const sub = subs.data as { starts_on: string; ends_on: string | null; is_active: boolean } | null;
  const initial = profile.full_name.trim().charAt(0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span
            className="grid size-16 shrink-0 place-items-center rounded-full bg-pink-100 text-hero font-semibold text-pink-700"
            aria-hidden="true"
          >
            {initial || '·'}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-title font-semibold">{profile.full_name || 'הפרופיל שלי'}</h1>
            <p className="truncate text-small text-muted" dir="ltr">
              {profile.email ?? formatIsraeliPhone(profile.phone)}
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

      <SubscriptionSummary allowance={allowance} title="המכסה החודש" cutoffHours={settings.cancellation_cutoff_hours} />

      <section aria-labelledby="personal" className="flex flex-col gap-3">
        <SectionHeading id="personal">פרטים אישיים</SectionHeading>
        <Card>
          <ProfileForm fullName={profile.full_name} phone={formatIsraeliPhone(profile.phone)} email={profile.email ?? ''} />
        </Card>
      </section>

      <section aria-labelledby="password" className="flex flex-col gap-3">
        <SectionHeading id="password">שינוי סיסמה</SectionHeading>
        <Card>
          <ChangePasswordForm />
        </Card>
      </section>

      <section aria-labelledby="notification-settings" className="flex flex-col gap-3">
        <SectionHeading id="notification-settings">הגדרות התראות</SectionHeading>
        <Card>
          <NotificationSettings vapidPublicKey={getVapidPublicKey()} preferences={preferences} deviceEndpoints={deviceEndpoints} />
        </Card>
      </section>

      <section aria-labelledby="usage-history" className="flex flex-col gap-3">
        <SectionHeading id="usage-history">היסטוריית שימוש חודשית</SectionHeading>
        <DataTable caption="היסטוריית שימוש חודשית" className="min-w-0">
          <THead>
            <Tr>
              <Th>חודש</Th>
              <Th className="text-center">מכסה</Th>
              <Th className="text-center">נוצלו</Th>
              <Th className="text-center">השתתפה</Th>
              <Th className="text-center">ביטול מאוחר</Th>
              <Th className="text-center">לא הגעת</Th>
            </Tr>
          </THead>
          <tbody>
            {usage.map((row) => (
              <Tr key={row.month_start}>
                <Td>{formatMonthHe(row.month_start)}</Td>
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
