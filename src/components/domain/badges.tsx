import { Check, Gauge, X } from 'lucide-react';
import { Badge } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import {
  APPROVAL_LABEL_HE,
  APPROVAL_TONE,
  BOOKING_STATUS_LABEL_HE,
  BOOKING_STATUS_TONE,
  SESSION_STATUS_LABEL_HE,
  SESSION_STATUS_TONE,
} from '@/lib/domain/labels';
import { TRIAL_MEMBER_TAG_HE } from '@/lib/domain/trial';
import type { ApprovalStatus, BookingStatus, SessionStatus } from '@/lib/domain/types';

/** Level badge: icon + text, same look everywhere (member and admin). */
export function SkillLevelBadge({ label }: { label: string }) {
  return (
    <Badge tone="blue">
      <Gauge className="size-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={BOOKING_STATUS_TONE[status]}>{BOOKING_STATUS_LABEL_HE[status]}</Badge>;
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return <Badge tone={SESSION_STATUS_TONE[status]}>{SESSION_STATUS_LABEL_HE[status]}</Badge>;
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return <Badge tone={APPROVAL_TONE[status]}>{APPROVAL_LABEL_HE[status]}</Badge>;
}

export function TrialMemberIndicator({ hadTrial }: { hadTrial: boolean }) {
  const Icon = hadTrial ? Check : X;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-small font-semibold',
        hadTrial ? 'text-ocean-700' : 'text-muted',
      )}
      title={hadTrial ? 'ביצעה או רשומה לאימון ניסיון' : 'עדיין לא באימון ניסיון'}
    >
      <span>{TRIAL_MEMBER_TAG_HE}</span>
      <Icon className={cn('size-4 shrink-0', hadTrial ? 'text-green-700' : 'text-red-600')} aria-hidden="true" />
      <span className="sr-only">{hadTrial ? 'כן' : 'לא'}</span>
    </span>
  );
}
