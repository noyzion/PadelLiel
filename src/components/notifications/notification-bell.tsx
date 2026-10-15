'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getUnreadCountAction } from '@/app/(member)/notifications/actions';
import { cn } from '@/lib/cn';

export const NOTIFICATIONS_CHANGED_EVENT = 'padel:notifications-changed';

/**
 * Header bell with the unread count. The count comes from the server on every full render and is then kept fresh
 * (page changes, window focus, once a minute, and instantly when a Push arrives while the app is open).
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [seenInitial, setSeenInitial] = useState(initialUnread);
  const pathname = usePathname();

  // A fresh server-rendered count (after a revalidation) replaces whatever was polled before.
  if (seenInitial !== initialUnread) {
    setSeenInitial(initialUnread);
    setUnread(initialUnread);
  }

  const refresh = useCallback(async () => {
    const result = await getUnreadCountAction();
    if (result.ok) setUnread(result.data);
  }, []);

  // Moving to another page: ask again (the layout is not re-rendered on client navigations).
  useEffect(() => {
    let cancelled = false;
    void getUnreadCountAction().then((result) => {
      if (!cancelled && result.ok) setUnread(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object' && (event.data as { type?: string }).type === 'notification-received') void refresh();
    };
    const onChanged = () => void refresh();

    const timer = window.setInterval(onVisible, 60_000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [refresh]);

  const label = unread > 0 ? `התראות, ${unread} חדשות` : 'התראות';
  return (
    <Link
      href="/notifications"
      aria-label={label}
      aria-current={pathname === '/notifications' ? 'page' : undefined}
      className={cn(
        'relative grid size-11 place-items-center rounded-control text-navy-900 transition-colors duration-150 hover:bg-navy-50 active:bg-navy-100',
        pathname === '/notifications' && 'bg-pink-100 text-pink-700',
      )}
    >
      <Bell className="size-6" strokeWidth={1.6} aria-hidden="true" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="num absolute end-1 top-1 grid min-w-[1.125rem] place-items-center rounded-full border-2 border-surface bg-pink-700 px-1 text-[0.625rem] font-bold leading-[1.0625rem] text-white"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
