import type { Metadata } from 'next';
import { PlanManager } from '@/components/admin/config-forms';
import { Alert, PageHeader } from '@/components/ui/card';
import { israelToday } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { listPlans } from '@/server/services/admin-plans';
import { unwrap } from '@/server/rpc';

export const metadata: Metadata = { title: 'תוכניות מנוי' };

export default async function AdminPlansPage() {
  const { db } = await requireAdmin();
  const today = israelToday();
  const [plans, subs] = await Promise.all([
    listPlans(db),
    db.from('member_subscriptions').select('plan_id, starts_on, ends_on').eq('is_active', true),
  ]);

  const memberCounts: Record<string, number> = {};
  for (const s of unwrap(subs) as { plan_id: string; starts_on: string; ends_on: string | null }[]) {
    if (s.starts_on <= today && (!s.ends_on || s.ends_on >= today)) memberCounts[s.plan_id] = (memberCounts[s.plan_id] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="תוכניות מנוי" description="כמה אימונים מתאמנת יכולה לקחת בכל שבוע (ראשון עד שבת)" />
      <Alert tone="blue">התוכניות קובעות מכסה חודשית בלבד. אין תשלומים באפליקציה.</Alert>
      <PlanManager plans={plans} memberCounts={memberCounts} />
    </div>
  );
}
