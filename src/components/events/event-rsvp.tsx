'use client';

import { useState } from 'react';
import { setEventRsvpAction } from '@/app/(member)/events/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useServerAction } from '@/components/use-server-action';
import {
  EVENT_RSVP_LABEL_HE,
  EVENT_RSVP_TOAST_HE,
  type EventRsvpStatus,
} from '@/lib/domain/event-rsvp';

export function EventRsvp({
  eventId,
  initialStatus,
}: {
  eventId: string;
  initialStatus: EventRsvpStatus | null;
}) {
  const { pending, run } = useServerAction();
  const [status, setStatus] = useState<EventRsvpStatus | null>(initialStatus);

  const choose = (next: EventRsvpStatus) => {
    if (status === next || pending) return;
    run(() => setEventRsvpAction({ eventId, status: next }), {
      success: EVENT_RSVP_TOAST_HE[next],
      onSuccess: () => setStatus(next),
    });
  };

  return (
    <Card tone="pink" className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {status ? (
        <p className="text-body font-semibold text-navy-900">
          {status === 'GOING' ? 'אישרת הגעה — מחכות לך!' : 'עדכנת שלא תוכלי להגיע.'}
        </p>
      ) : (
        <div>
          <p className="text-body font-semibold text-navy-900">מגיעה?</p>
          <p className="mt-1 text-small text-muted">אישור קטן עוזר לנו לדעת לחכות לך. בלי מכסות ובלי הרשמה לאימון.</p>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant={status === 'GOING' ? 'accent' : 'primary'}
          className="flex-1"
          disabled={pending}
          aria-pressed={status === 'GOING'}
          onClick={() => choose('GOING')}
        >
          מאשרת הגעה
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          disabled={pending}
          aria-pressed={status === 'NOT_GOING'}
          onClick={() => choose('NOT_GOING')}
        >
          לא אוכל להגיע
        </Button>
      </div>
      {status ? (
        <p className="text-caption text-muted">הסטטוס שלך: {EVENT_RSVP_LABEL_HE[status]}. אפשר לשנות עד שהאירוע מסתיים.</p>
      ) : null}
    </Card>
  );
}
