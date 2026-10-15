import type { Metadata } from 'next';
import { NotificationList } from '@/components/notifications/notification-list';
import { PageHeader } from '@/components/ui/card';
import { requireMember } from '@/server/auth';
import { getNotifications } from '@/server/services/notifications';

export const metadata: Metadata = { title: 'התראות' };

export default async function NotificationsPage() {
  const { db } = await requireMember();
  const items = await getNotifications(db);
  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <PageHeader title="התראות" description="עדכונים על ההרשמות והאימונים שלך." />
      <NotificationList items={items} />
    </div>
  );
}
