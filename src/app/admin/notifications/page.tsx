import type { Metadata } from 'next';
import { NotificationList } from '@/components/notifications/notification-list';
import { PageHeader } from '@/components/ui/card';
import { requireAdmin } from '@/server/auth';
import { getNotifications } from '@/server/services/notifications';

export const metadata: Metadata = { title: 'התראות' };

export default async function AdminNotificationsPage() {
  const { db } = await requireAdmin();
  const items = await getNotifications(db);
  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <PageHeader title="התראות" description="מתאמנות שממתינות לאישור, הרשמות, ביטולים ורשימת המתנה." />
      <NotificationList
        items={items}
        emptyDescription="כאן יופיעו הרשמות חדשות, ביטולים, ממתינות לאישור ומי שנכנסה לרשימת המתנה."
      />
    </div>
  );
}
