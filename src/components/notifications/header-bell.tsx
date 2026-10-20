import { Suspense } from 'react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getAuthContext } from '@/server/auth';
import { getUnreadCount } from '@/server/services/notifications';

/**
 * Header bell that does not block the rest of the layout or the page.
 * Auth still runs in the layout; the unread count streams in beside it.
 */
export function HeaderNotificationBell({ href }: { href?: string }) {
  return (
    <Suspense fallback={<NotificationBell initialUnread={0} href={href} />}>
      <UnreadBell href={href} />
    </Suspense>
  );
}

async function UnreadBell({ href }: { href?: string }) {
  const ctx = await getAuthContext();
  const unread = ctx ? await getUnreadCount(ctx.db) : 0;
  return <NotificationBell initialUnread={unread} href={href} />;
}
