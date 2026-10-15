import { NotificationBell } from '@/components/notifications/notification-bell';
import { ServiceWorkerRegistrar } from '@/components/notifications/sw-registrar';
import type { NavItem } from '@/components/nav-links';
import { AppShell } from '@/components/shell/app-shell';
import { getVapidPublicKey } from '@/lib/env';
import { requireMember } from '@/server/auth';
import { getUnreadCount } from '@/server/services/notifications';

export const dynamic = 'force-dynamic';

const NAV: NavItem[] = [
  { href: '/', label: 'בית', icon: 'home', exact: true },
  { href: '/schedule', label: 'אימונים', icon: 'calendar' },
  { href: '/bookings', label: 'ההרשמות שלי', icon: 'bookings' },
  { href: '/events', label: 'אירועים בקהילה', tabLabel: 'אירועים', icon: 'events' },
  { href: '/profile', label: 'פרופיל', icon: 'profile' },
];

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const { db } = await requireMember();
  const unread = await getUnreadCount(db);
  return (
    <AppShell nav={NAV} headerActions={<NotificationBell initialUnread={unread} />}>
      <ServiceWorkerRegistrar enabled={Boolean(getVapidPublicKey())} />
      {children}
    </AppShell>
  );
}
