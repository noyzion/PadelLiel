'use client';

import { useState, useTransition } from 'react';
import { cancelBookingAction } from '@/app/(member)/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatHours } from '@/lib/time';

/**
 * Cancellation flow implementing the cutoff policy UX:
 *  - early: confirm, and say the weekly allowance will be restored
 *  - late : warn that the session still counts, and require an explicit confirmation
 * The classification shown here is only a preview. The database re-checks the time on submit; if
 * it turned late meanwhile, the server asks for confirmation and this dialog switches to the late variant.
 */
export function CancelBookingButton({
  bookingId,
  isLateWindow,
  cutoffHours,
  label,
  size = 'sm',
  className,
}: {
  bookingId: string;
  isLateWindow: boolean;
  cutoffHours: number;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [late, setLate] = useState(isLateWindow);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const hours = formatHours(cutoffHours);

  function submit() {
    startTransition(async () => {
      const result = await cancelBookingAction({ bookingId, confirmLate: late });
      if (result.ok) {
        setOpen(false);
        toast.success(
          result.data.allowance_restored
            ? 'הביטול נשמר, והמקום חזר למכסה השבועית שלך.'
            : 'ההרשמה בוטלה והמקום שוחרר. האימון עדיין ייחשב במכסה השבועית שלך.',
        );
        return;
      }
      if (result.code === 'LATE_CANCELLATION_CONFIRMATION_REQUIRED') {
        setLate(true); // the cutoff passed while the dialog was open
        return;
      }
      setOpen(false);
      toast.error(result.error);
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        size={size}
        className={className}
        onClick={() => {
          setLate(isLateWindow);
          setOpen(true);
        }}
      >
        ביטול הרשמה
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={late ? `נותרו פחות מ-${hours} שעות לאימון` : 'ביטול הרשמה'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              חזרה
            </Button>
            <Button variant={late ? 'danger' : 'primary'} onClick={submit} loading={pending}>
              {late ? 'ביטול בכל זאת' : 'כן, לבטל את ההרשמה'}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-body font-semibold text-navy-900">{label}</p>
        {late ? (
          <Alert tone="amber" title="שימי לב">
            אם תבטלי, האימון עדיין ייחשב במכסה השבועית שלך ולא יוחזר.
            <br />
            המקום ישוחרר ויהיה זמין לחברה אחרת בקהילה.
          </Alert>
        ) : (
          <Alert tone="green" title="ביטול בזמן">
            הביטול הוא לפחות {hours} שעות לפני האימון, ולכן האימון יחזור למכסה השבועית שלך ותוכלי להירשם לאימון אחר.
          </Alert>
        )}
      </Modal>
    </>
  );
}
