import type { Metadata } from 'next';
import Link from 'next/link';
import { SettingsForm } from '@/components/admin/config-forms';
import { NotificationSettings } from '@/components/notifications/notification-settings';
import { ButtonLink } from '@/components/ui/button';
import { Card, PageHeader, SectionHeading } from '@/components/ui/card';
import { getVapidPublicKey } from '@/lib/env';
import { requireAdmin } from '@/server/auth';
import { getDeviceEndpoints, getPreferences } from '@/server/services/notifications';
import { getSettings } from '@/server/services/settings';

export const metadata: Metadata = { title: 'הגדרות' };

export default async function AdminSettingsPage() {
  const { db } = await requireAdmin();
  const [settings, preferences, deviceEndpoints] = await Promise.all([
    getSettings(db),
    getPreferences(db),
    getDeviceEndpoints(db),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="הגדרות"
        description="מדיניות ביטולים וברירות מחדל לאימונים"
        actions={
          <ButtonLink href="/admin/audit" variant="secondary" size="sm">
            יומן פעולות
          </ButtonLink>
        }
      />
      <SettingsForm settings={settings} />
      <section aria-labelledby="staff-notifications" className="flex flex-col gap-3">
        <SectionHeading id="staff-notifications">התראות לצוות</SectionHeading>
        <Card>
          <NotificationSettings
            audience="staff"
            vapidPublicKey={getVapidPublicKey()}
            preferences={preferences}
            deviceEndpoints={deviceEndpoints}
          />
        </Card>
      </section>
      <Link href="/admin/plans" className="text-small underline underline-offset-4">
        ניהול תוכניות מנוי
      </Link>
    </div>
  );
}
