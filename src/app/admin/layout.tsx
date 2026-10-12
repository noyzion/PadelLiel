import type { NavItem } from '@/components/nav-links';
import { AdminShell } from '@/components/shell/admin-shell';
import { requireAdmin } from '@/server/auth';

const NAV: NavItem[] = [
  { href: '/admin', label: 'דשבורד', icon: 'dashboard', exact: true },
  { href: '/admin/schedule', label: 'לוח אימונים', icon: 'calendar' },
  { href: '/admin/members', label: 'מתאמנות', icon: 'members' },
  { href: '/admin/plans', label: 'מנויים', icon: 'plans' },
  { href: '/admin/settings', label: 'הגדרות', icon: 'settings' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();
  return (
    <AdminShell nav={NAV} name={profile.full_name || 'מאמנת'}>
      {children}
    </AdminShell>
  );
}
