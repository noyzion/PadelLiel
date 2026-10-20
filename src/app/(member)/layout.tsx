import { HeaderNotificationBell } from '@/components/notifications/header-bell';
import { ServiceWorkerRegistrar } from '@/components/notifications/sw-registrar';
import type { NavItem } from '@/components/nav-links';
import { AppShell } from '@/components/shell/app-shell';
import { getVapidPublicKey } from '@/lib/env';
import { requireMember } from '@/server/auth';

export const dynamic = 'force-dynamic';

const NAV: NavItem[] = [
  { href: '/', label: 'בית', icon: 'home', exact: true },
  { href: '/schedule', label: 'אימונים', icon: 'calendar' },
  { href: '/bookings', label: 'ההרשמות שלי', icon: 'bookings' },
  { href: '/events', label: 'אירועים בקהילה', tabLabel: 'אירועים', icon: 'events' },
  { href: '/profile', label: 'פרופיל', icon: 'profile' },
];

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return (
    <AppShell nav={NAV} headerActions={<HeaderNotificationBell />}>
      <ServiceWorkerRegistrar enabled={Boolean(getVapidPublicKey())} />
      {children}
    </AppShell>
  );
}
