import type { NavItem } from '@/components/nav-links';
import { AppShell } from '@/components/shell/app-shell';
import { requireMember } from '@/server/auth';

const NAV: NavItem[] = [
  { href: '/', label: 'בית', icon: 'home', exact: true },
  { href: '/schedule', label: 'אימונים', icon: 'calendar' },
  { href: '/bookings', label: 'ההרשמות שלי', icon: 'bookings' },
  { href: '/profile', label: 'פרופיל', icon: 'profile' },
];

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return <AppShell nav={NAV}>{children}</AppShell>;
}
