'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LinkBusyInline } from '@/components/ui/pending-link';
import { CalendarDays, CalendarHeart, ClipboardList, History, House, Layers, LayoutDashboard, Settings, UserRound, Users } from 'lucide-react';
import { cn } from '@/lib/cn';

const ICONS = {
  home: House,
  calendar: CalendarDays,
  bookings: ClipboardList,
  profile: UserRound,
  dashboard: LayoutDashboard,
  members: Users,
  plans: Layers,
  settings: Settings,
  audit: History,
  events: CalendarHeart,
} as const;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Shorter label for the cramped bottom tab bar (the full label stays the accessible name). */
  tabLabel?: string;
  /** Match the pathname exactly (used for "/" and "/admin"). */
  exact?: boolean;
}

/** `tabs` = bottom navigation (phones), `inline` = top navigation (desktop), `side` = admin sidebar. */
export function NavLinks({
  items,
  layout,
  className,
}: {
  items: NavItem[];
  layout: 'tabs' | 'inline' | 'side';
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="ניווט ראשי" className={className}>
      <ul
        className={cn(
          layout === 'tabs' && 'grid auto-cols-fr grid-flow-col',
          layout === 'inline' && 'flex items-center gap-1',
          layout === 'side' && 'flex flex-col gap-1',
        )}
      >
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={layout === 'tabs' && item.tabLabel ? item.label : undefined}
                className={cn(
                  'flex items-center transition-colors duration-150',
                  layout === 'tabs' && 'min-h-16 flex-col justify-center gap-1 px-1 text-[0.6875rem] font-semibold',
                  layout === 'inline' && 'gap-2 rounded-control px-4 py-2.5 text-small font-semibold',
                  layout === 'side' && 'gap-3 rounded-control px-4 py-3 text-small font-semibold',
                  layout === 'tabs' && (active ? 'text-navy-900' : 'text-muted active:text-navy-900'),
                  layout !== 'tabs' &&
                    (active ? 'bg-pink-100 text-navy-900' : 'text-muted hover:bg-navy-50 hover:text-navy-900 active:bg-navy-100'),
                )}
              >
                {layout === 'tabs' ? (
                  <span
                    className={cn(
                      'grid h-8 w-14 place-items-center rounded-chip transition-colors duration-150',
                      active ? 'bg-pink-100 text-pink-700' : '',
                    )}
                  >
                    <Icon className="size-6" aria-hidden="true" strokeWidth={1.6} />
                  </span>
                ) : (
                  <Icon className="size-5" aria-hidden="true" strokeWidth={1.6} />
                )}
                <span>{layout === 'tabs' ? (item.tabLabel ?? item.label) : item.label}</span>
                {layout !== 'tabs' ? <LinkBusyInline /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
