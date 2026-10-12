'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteEventAction, setEventStatusAction } from '@/app/admin/events/actions';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useServerAction } from '@/components/use-server-action';
import type { EventStatus } from '@/lib/domain/events';

/** Publishes a draft or takes a published event back to draft (it disappears from trainees immediately). */
export function PublishToggleButton({ eventId, status }: { eventId: string; status: EventStatus }) {
  const { pending, run } = useServerAction();
  const publishing = status === 'DRAFT';
  return (
    <Button
      size="sm"
      variant={publishing ? 'primary' : 'secondary'}
      loading={pending}
      onClick={() =>
        run(() => setEventStatusAction({ eventId, status: publishing ? 'PUBLISHED' : 'DRAFT' }), {
          success: publishing ? 'האירוע פורסם' : 'פרסום האירוע בוטל',
        })
      }
    >
      {publishing ? 'פרסום' : 'ביטול פרסום'}
    </Button>
  );
}

/** Delete with an explicit confirmation step. */
export function DeleteEventButton({ eventId, title, redirectTo }: { eventId: string; title: string; redirectTo?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, run } = useServerAction();

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        מחיקה
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="מחיקת אירוע"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              חזרה
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                run(() => deleteEventAction({ eventId }), {
                  success: 'האירוע נמחק',
                  onSuccess: () => {
                    setOpen(false);
                    if (redirectTo) router.push(redirectTo);
                  },
                })
              }
            >
              מחיקת האירוע
            </Button>
          </>
        }
      >
        <p>
          האירוע <span className="font-semibold text-navy-900">{title}</span> יימחק לצמיתות, יחד עם התמונה שלו, ולא יופיע יותר
          אצל המתאמנות. אי אפשר לבטל את הפעולה.
        </p>
      </Modal>
    </>
  );
}
