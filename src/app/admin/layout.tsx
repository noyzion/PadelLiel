import { NotificationBell } from '@/components/notifications/notification-bell';
import { ServiceWorkerRegistrar } from '@/components/notifications/sw-registrar';
import type { NavItem } from '@/components/nav-links';
import { AdminShell } from '@/components/shell/admin-shell';
import { getVapidPublicKey } from '@/lib/env';
import { requireAdmin } from '@/server/auth';
import { getUnreadCount } from '@/server/services/notifications';

const NAV: NavItem[] = [
  { href: '/admin', label: 'דשבורד', icon: 'dashboard', exact: true },
  { href: '/admin/schedule', label: 'לוח אימונים', icon: 'calendar' },
  { href: '/admin/members', label: 'מתאמנות', icon: 'members' },
  { href: '/admin/events', label: 'אירועים', icon: 'events' },
  { href: '/admin/plans', label: 'מנויים', icon: 'plans' },
  { href: '/admin/settings', label: 'הגדרות', icon: 'settings' },
];

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { db, profile } = await requireAdmin();
  const unread = await getUnreadCount(db);
  return (
    <AdminShell
      nav={NAV}
      name={profile.full_name || 'מאמנת'}
      headerActions={<NotificationBell initialUnread={unread} href="/admin/notifications" />}
    >
      <ServiceWorkerRegistrar enabled={Boolean(getVapidPublicKey())} />
      {children}
    </AdminShell>
  );
}
