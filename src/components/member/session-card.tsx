'use client';

import { Check, Hourglass, Info, MapPin } from 'lucide-react';
import { useState, useTransition } from 'react';
import { bookSessionAction, joinWaitlistAction, leaveWaitlistAction } from '@/app/(member)/actions';
import { CapacityIndicator } from '@/components/domain/capacity-indicator';
import { SkillLevelBadge } from '@/components/domain/badges';
import { CancelBookingButton } from '@/components/member/cancel-booking';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { VENUE_NAME } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { blockReasonHe } from '@/lib/domain/errors';
import type { ScheduleSession } from '@/lib/domain/types';
import { formatDateHe, formatHours, formatTimeRange } from '@/lib/time';

export function SessionCard({
  session,
  levelLabel,
  cutoffHours,
}: {
  session: ScheduleSession;
  levelLabel: string;
  cutoffHours: number;
}) {
  const [lateBookOpen, setLateBookOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const hours = formatHours(cutoffHours);

  const label = `${formatDateHe(session.session_date)} · ${formatTimeRange(session.start_time, session.end_time)}`;
  const isBooked = Boolean(session.my_booking_id);
  const isOnWaitlist = Boolean(session.my_waitlist_entry_id);
  const cancelled = session.status === 'CANCELLED';
  const finished = session.status === 'COMPLETED' || session.block_reason === 'SESSION_STARTED';
  const canBook = !isBooked && !cancelled && !finished && session.block_reason === null;
  const canWait = !isBooked && !isOnWaitlist && !cancelled && !finished && session.block_reason === 'SESSION_FULL';
  const disabledReason =
    !isBooked && !canBook && !canWait && !cancelled && !finished && !isOnWaitlist ? blockReasonHe(session.block_reason) : null;

  function book(ack: boolean) {
    startTransition(async () => {
      const result = await bookSessionAction({ sessionId: session.id, ackLatePolicy: ack });
      if (result.ok) {
        setLateBookOpen(false);
        toast.success('נרשמת לאימון');
      } else if (result.code === 'LATE_POLICY_ACK_REQUIRED') {
        setLateBookOpen(true);
      } else {
        setLateBookOpen(false);
        toast.error(result.error);
      }
    });
  }

  function join() {
    startTransition(async () => {
      const result = await joinWaitlistAction({ sessionId: session.id });
      if (result.ok) toast.success('נוספת לרשימת ההמתנה. הצוות שלנו יוכל לשבץ אותך אם יתפנה מקום.');
      else toast.error(result.error);
    });
  }

  function leave() {
    if (!session.my_waitlist_entry_id) return;
    const entryId = session.my_waitlist_entry_id;
    startTransition(async () => {
      const result = await leaveWaitlistAction({ entryId });
      if (result.ok) toast.info('הוסרת מרשימת ההמתנה.');
      else toast.error(result.error);
    });
  }

  return (
    <article
      aria-label={label}
      className={cn(
        'flex flex-col gap-4 rounded-card border bg-surface p-5 shadow-soft transition-shadow duration-150',
        isBooked ? 'border-success-line ring-1 ring-success-line' : 'border-line',
        (cancelled || finished) && 'bg-canvas',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="num text-title font-semibold leading-none text-navy-900">
            <bdi>{formatTimeRange(session.start_time, session.end_time)}</bdi>
          </p>
          <p className="mt-1.5 text-small font-medium text-muted">{formatDateHe(session.session_date)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <SkillLevelBadge label={levelLabel} />
          {cancelled ? <Badge tone="red">האימון בוטל</Badge> : null}
          {isBooked ? (
            <Badge tone="green">
              <Check className="size-3.5" aria-hidden="true" />
              את רשומה
            </Badge>
          ) : null}
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 text-small text-muted">
        <li className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-ocean-700" aria-hidden="true" />
          <span>{VENUE_NAME}</span>
        </li>
      </ul>

      {!cancelled ? <CapacityIndicator taken={session.occupied_count} capacity={session.capacity} waiting={session.waitlist_count} /> : null}

      {isOnWaitlist ? (
        <Alert tone="amber">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Hourglass className="size-4" aria-hidden="true" />
            את ברשימת ההמתנה · מקום {session.my_waitlist_position}
          </span>
        </Alert>
      ) : null}

      <div className="mt-auto flex flex-col gap-2">
        {isBooked && session.my_booking_id && session.my_booking_status === 'CONFIRMED' && !finished ? (
          <CancelBookingButton
            bookingId={session.my_booking_id}
            isLateWindow={session.is_late_window}
            cutoffHours={cutoffHours}
            label={label}
            size="md"
            className="w-full"
          />
        ) : null}

        {canBook ? (
          <Button racket="start" className="w-full" loading={pending} onClick={() => (session.is_late_window ? setLateBookOpen(true) : book(false))}>
            להרשמה לאימון
          </Button>
        ) : null}

        {canWait ? (
          <>
            <p className="text-small text-muted">האימון מלא. רוצה להיכנס לרשימת ההמתנה?</p>
            <Button variant="accent" racket="end" className="w-full" loading={pending} onClick={join}>
              הצטרפות לרשימת המתנה
            </Button>
          </>
        ) : null}

        {isOnWaitlist ? (
          <Button variant="ghost" size="sm" className="w-full" loading={pending} onClick={leave}>
            יציאה מרשימת ההמתנה
          </Button>
        ) : null}

        {disabledReason ? (
          <>
            <Button disabled className="w-full">
              להרשמה לאימון
            </Button>
            <p className="flex items-start gap-2 rounded-control bg-canvas px-3 py-2 text-small text-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-ocean-700" aria-hidden="true" />
              {disabledReason}
            </p>
          </>
        ) : null}

        {finished && !isBooked && !cancelled ? <p className="text-small text-muted">האימון הסתיים או שכבר התחיל.</p> : null}
        {canBook && session.is_late_window ? (
          <p className="text-center text-caption text-muted">הרשמה של פחות מ-{hours} שעות לפני האימון</p>
        ) : null}
      </div>

      <Modal
        open={lateBookOpen}
        onClose={() => !pending && setLateBookOpen(false)}
        title="הרשמה ברגע האחרון"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLateBookOpen(false)} disabled={pending}>
              חזרה
            </Button>
            <Button onClick={() => book(true)} loading={pending}>
              אני מבינה, להרשמה
            </Button>
          </>
        }
      >
        <p className="mb-3 text-body font-semibold text-navy-900">{label}</p>
        <Alert tone="amber" title="שימי לב">
          האימון מתחיל בעוד פחות מ-{hours} שעות. אם תבטלי את ההרשמה הזו, האימון עדיין ייספר במכסה החודשית שלך.
        </Alert>
      </Modal>
    </article>
  );
}
