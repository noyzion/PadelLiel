import { Gauge } from 'lucide-react';
import { Badge } from '@/components/ui/card';
import {
  APPROVAL_LABEL_HE,
  APPROVAL_TONE,
  BOOKING_STATUS_LABEL_HE,
  BOOKING_STATUS_TONE,
  SESSION_STATUS_LABEL_HE,
  SESSION_STATUS_TONE,
} from '@/lib/domain/labels';
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
