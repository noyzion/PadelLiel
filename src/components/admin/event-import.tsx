'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { importAnnualEventsAction } from '@/app/admin/events/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { useServerAction } from '@/components/use-server-action';
import { IMPORT_CONFIRM_PHRASE } from '@/lib/domain/event-import';

/**
 * The only way to write the annual events: an explicit confirmation step (typed phrase) in front of the server
 * action, which re-checks admin rights, the server-side ALLOW_EVENT_IMPORT switch, and recomputes the plan itself.
 */
export function ImportAnnualEventsButton({ createCount, enabled }: { createCount: number; enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string>();
  const { pending, run } = useServerAction();

  const close = () => {
    setOpen(false);
    setPhrase('');
    setError(undefined);
  };

  return (
    <>
      <Button disabled={!enabled || createCount === 0} onClick={() => setOpen(true)}>
        {createCount === 0 ? 'אין מה לייבא' : `ייבוא ${createCount} טיוטות`}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="אישור ייבוא אירועים"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={close}>
              חזרה
            </Button>
            <Button
              loading={pending}
              disabled={phrase.trim() !== IMPORT_CONFIRM_PHRASE}
              onClick={() =>
                run(() => importAnnualEventsAction({ confirm: phrase.trim() }), {
                  success: (r) => `נוצרו ${r.created} טיוטות (${r.skipped} דולגו)`,
                  onSuccess: () => {
                    close();
                    router.push('/admin/events');
                  },
                  onError: (message) => setError(message),
                })
              }
            >
              ייבוא כטיוטות
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p>
            ייווצרו <span className="font-semibold text-navy-900">{createCount}</span> אירועים חדשים כ<span className="font-semibold text-navy-900">טיוטות</span>{' '}
            במסד הנתונים. כלום לא יפורסם, אירועים קיימים לא ישתנו, ולא יוזנו שעות או תמונות.
          </p>
          <Field label={`להמשך, הקלידי: ${IMPORT_CONFIRM_PHRASE}`} error={error}>
            {(p) => <Input {...p} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
      </Modal>
    </>
  );
}
