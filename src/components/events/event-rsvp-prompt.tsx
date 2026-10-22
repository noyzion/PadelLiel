'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { setEventRsvpAction } from '@/app/(member)/events/actions';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useServerAction } from '@/components/use-server-action';
import {
  EVENT_RSVP_PROMPT_TITLE,
  EVENT_RSVP_TOAST_HE,
  eventRsvpPromptMessage,
  eventRsvpPromptWhen,
} from '@/lib/domain/event-rsvp';
import type { EventView } from '@/lib/domain/events';

const dismissKey = (eventId: string) => `event-rsvp-dismiss:${eventId}`;

function readDismissed(eventId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(eventId)) === '1';
  } catch {
    return false;
  }
}

export function EventRsvpPrompt({ event }: { event: EventView | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { pending, run } = useServerAction();
  const [closedFor, setClosedFor] = useState<string | null>(null);

  if (!event) return null;

  const onEventPage = pathname === `/events/${event.id}`;
  const open = !onEventPage && closedFor !== eventId && !readDismissed(event.id);

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(event.id), '1');
    } catch {
      /* Private mode: just close for this view. */
    }
    setClosedFor(event.id);
  };

  const choose = (status: 'GOING' | 'NOT_GOING') => {
    run(() => setEventRsvpAction({ eventId: event.id, status }), {
      success: EVENT_RSVP_TOAST_HE[status],
      onSuccess: () => {
        setClosedFor(event.id);
        router.refresh();
      },
    });
  };

  const startsAt = event.effective_starts_at ?? event.starts_at ?? event.date_start ?? '';
  const message = eventRsvpPromptMessage(event.title, eventRsvpPromptWhen(startsAt));

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : dismiss}
      title={EVENT_RSVP_PROMPT_TITLE}
      footer={
        <>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => choose('NOT_GOING')}>
            לא אוכל להגיע
          </Button>
          <Button type="button" variant="accent" disabled={pending} onClick={() => choose('GOING')}>
            מאשרת הגעה
          </Button>
        </>
      }
    >
      <p className="leading-relaxed text-ink">{message}</p>
    </Modal>
  );
}
