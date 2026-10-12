import type { Metadata } from 'next';
import Link from 'next/link';
import { SettingsForm } from '@/components/admin/config-forms';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { requireAdmin } from '@/server/auth';
import { getSettings } from '@/server/services/settings';

export const metadata: Metadata = { title: 'הגדרות' };

export default async function AdminSettingsPage() {
  const { db } = await requireAdmin();
  const settings = await getSettings(db);
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
      <Link href="/admin/plans" className="text-small underline underline-offset-4">
        ניהול תוכניות מנוי
      </Link>
    </div>
  );
}
