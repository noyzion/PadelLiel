'use client';

import { Bell, BellRing, CalendarCheck, CalendarDays, CalendarX, Clock, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { markAllNotificationsReadAction, markNotificationReadAction } from '@/app/(member)/notifications/actions';
import { NOTIFICATIONS_CHANGED_EVENT } from '@/components/notifications/notification-bell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useServerAction } from '@/components/use-server-action';
import { cn } from '@/lib/cn';
import { notificationHref } from '@/lib/domain/notifications';
import type { AppNotification, NotificationType } from '@/lib/domain/types';
import { formatInstantHe } from '@/lib/time';

const ICONS: Record<NotificationType, LucideIcon> = {
  booking_confirmed: CalendarCheck,
  training_reminder: BellRing,
  cancellation_deadline: Clock,
  session_cancelled: CalendarX,
  schedule_published: CalendarDays,
};

function announceChange() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function NotificationList({ items }: { items: AppNotification[] }) {
  const router = useRouter();
  const { pending, run } = useServerAction();
  // Items marked as read in this view are shown as read immediately (before the server round trip returns).
  const [locallyRead, setLocallyRead] = useState<Set<string>>(new Set());

  const isUnread = (n: AppNotification) => n.read_at === null && !locallyRead.has(n.id);
  const unreadCount = items.filter(isUnread).length;

  const markRead = (id: string) => {
    setLocallyRead((prev) => new Set(prev).add(id));
    void markNotificationReadAction({ id }).then(() => {
      announceChange();
      router.refresh();
    });
  };

  const markAll = () =>
    run(() => markAllNotificationsReadAction(), {
      onSuccess: () => {
        setLocallyRead(new Set(items.map((n) => n.id)));
        announceChange();
        router.refresh();
      },
    });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-pink-100 text-pink-700" aria-hidden="true">
          <Bell className="size-7" strokeWidth={1.6} />
        </span>
        <p className="text-card font-semibold text-navy-900">אין עדכונים עדיין</p>
        <p className="max-w-sm text-small text-muted">כאן יופיעו אישורי הרשמה, תזכורות לאימונים ועדכונים מהצוות שלנו.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <p className="text-small text-muted" aria-live="polite">
          {unreadCount > 0 ? (
            <>
              <span className="num font-semibold text-navy-900">{unreadCount}</span> {unreadCount === 1 ? 'עדכון חדש' : 'עדכונים חדשים'}
            </>
          ) : (
            'הכול נקרא'
          )}
        </p>
        <Button variant="secondary" size="sm" onClick={markAll} loading={pending} disabled={unreadCount === 0}>
          סימון הכול כנקרא
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-line">
          {items.map((n) => {
            const unread = isUnread(n);
            const Icon = ICONS[n.type] ?? Bell;
            const href = notificationHref(n.destination_url);
            const body = (
              <>
                <span className="flex items-center gap-2">
                  {unread ? <span className="size-2 shrink-0 rounded-full bg-pink-700" aria-hidden="true" /> : null}
                  <span className={cn('text-body text-navy-900', unread ? 'font-semibold' : 'font-medium')}>{n.title}</span>
                  {unread ? <span className="sr-only">(חדש)</span> : null}
                </span>
                <span className="mt-0.5 block text-small leading-relaxed text-muted">{n.message}</span>
              </>
            );
            return (
              <li key={n.id} className={cn('flex gap-3 p-4 transition-colors duration-150', unread ? 'bg-pink-50' : 'bg-surface')}>
                <span
                  className={cn('grid size-10 shrink-0 place-items-center rounded-full', unread ? 'bg-pink-100 text-pink-700' : 'bg-navy-50 text-navy-700')}
                  aria-hidden="true"
                >
                  <Icon className="size-5" strokeWidth={1.6} />
                </span>
                <div className="min-w-0 flex-1">
                  {href ? (
                    <Link href={href} onClick={() => unread && markRead(n.id)} className="block rounded-control focus-visible:outline-3">
                      {body}
                    </Link>
                  ) : (
                    <div>{body}</div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <time dateTime={n.created_at} className="num text-caption text-muted">
                      {formatInstantHe(n.created_at)}
                    </time>
                    {unread ? (
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="min-h-9 rounded-control px-2 text-caption font-semibold text-pink-700 hover:bg-pink-100 focus-visible:outline-3"
                      >
                        סימון כנקרא
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
