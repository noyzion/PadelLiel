import { EventRsvpPrompt } from '@/components/events/event-rsvp-prompt';
import { HeaderNotificationBell } from '@/components/notifications/header-bell';
import { ServiceWorkerRegistrar } from '@/components/notifications/sw-registrar';
import type { NavItem } from '@/components/nav-links';
import { AppShell } from '@/components/shell/app-shell';
import { getVapidPublicKey } from '@/lib/env';
import { nowMs } from '@/lib/now';
import { requireMember } from '@/server/auth';
import { getEventRsvpPrompt } from '@/server/services/events';

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
  const prompt = await getEventRsvpPrompt(db, new Date(nowMs()));
  return (
    <AppShell nav={NAV} headerActions={<HeaderNotificationBell />}>
      <ServiceWorkerRegistrar enabled={Boolean(getVapidPublicKey())} />
      <EventRsvpPrompt event={prompt} />
      {children}
    </AppShell>
  );
}
