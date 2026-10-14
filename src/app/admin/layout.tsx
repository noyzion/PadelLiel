import type { NavItem } from '@/components/nav-links';
import { AdminShell } from '@/components/shell/admin-shell';
import { COACH_NAME } from '@/lib/brand';
import { requireAdmin } from '@/server/auth';

const NAV: NavItem[] = [
  { href: '/admin', label: 'דשבורד', icon: 'dashboard', exact: true },
  { href: '/admin/schedule', label: 'לוח אימונים', icon: 'calendar' },
  { href: '/admin/members', label: 'מתאמנות', icon: 'members' },
  { href: '/admin/events', label: 'אירועים', icon: 'events' },
  { href: '/admin/plans', label: 'מנויים', icon: 'plans' },
  { href: '/admin/settings', label: 'הגדרות', icon: 'settings' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <AdminShell nav={NAV} name={COACH_NAME}>
      {children}
    </AdminShell>
  );
}
