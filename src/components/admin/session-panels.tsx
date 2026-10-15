'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  assignBookingAction,
  cancelSessionAction,
  completeSessionAction,
  deleteDraftSessionAction,
  promoteWaitlistAction,
  publishSessionsAction,
  removeWaitlistAction,
  restoreAllowanceAction,
  setBookingStatusAction,
  setRegistrationOpenAction,
} from '@/app/admin/actions';
import { SessionForm, type SessionFormInitial } from '@/components/admin/session-form';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge, SkillLevelBadge } from '@/components/domain/badges';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { useServerAction } from '@/components/use-server-action';
import { WAITLIST_STATUS_LABEL_HE, levelLabel } from '@/lib/domain/labels';
import type { BookingStatus, SessionStatus, SkillLevel } from '@/lib/domain/types';
import { formatIsraeliPhone } from '@/lib/phone';
import { formatInstantHe } from '@/lib/time';
import type { RosterEntry, WaitlistRow } from '@/server/services/admin-sessions';

/* ------------------------------------------------------------------ */
/* Session-level actions                                                */
/* ------------------------------------------------------------------ */

export function SessionActions({
  sessionId,
  status,
  registrationOpen,
  hasStarted,
  weekStart,
  initial,
  levels,
}: {
  sessionId: string;
  status: SessionStatus;
  registrationOpen: boolean;
  hasStarted: boolean;
  weekStart: string;
  initial: SessionFormInitial;
  levels: SkillLevel[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { pending, run } = useServerAction();
  const isEditable = status === 'DRAFT' || status === 'PUBLISHED';

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'DRAFT' ? (
        <Button size="sm" loading={pending} onClick={() => run(() => publishSessionsAction({ sessionIds: [sessionId] }), { success: 'האימון פורסם' })}>
          פרסום
        </Button>
      ) : null}
      {isEditable ? (
        <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
          עריכה
        </Button>
      ) : null}
      {status === 'PUBLISHED' ? (
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() =>
            run(() => setRegistrationOpenAction({ sessionId, open: !registrationOpen }), {
              success: registrationOpen ? 'ההרשמה נסגרה' : 'ההרשמה נפתחה',
            })
          }
        >
          {registrationOpen ? 'סגירת הרשמה' : 'פתיחת הרשמה'}
        </Button>
      ) : null}
      {status === 'PUBLISHED' && hasStarted ? (
        <Button size="sm" variant="soft" loading={pending} onClick={() => run(() => completeSessionAction({ sessionId }), { success: 'האימון סומן כהסתיים' })}>
          סימון כהסתיים
        </Button>
      ) : null}
      {status === 'DRAFT' ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDeleteOpen(true)}
        >
          מחיקת טיוטה
        </Button>
      ) : null}
      {status === 'PUBLISHED' ? (
        <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
          ביטול האימון
        </Button>
      ) : null}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="מחיקת טיוטה"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              חזרה
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                run(() => deleteDraftSessionAction({ sessionId }), {
                  success: 'הטיוטה נמחקה',
                  onSuccess: () => {
                    setDeleteOpen(false);
                    router.push(`/admin/schedule?week=${weekStart}`);
                  },
                })
              }
            >
              מחיקה
            </Button>
          </>
        }
      >
        <p>הטיוטה תימחק לצמיתות. לא ניתן לשחזר אותה.</p>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="עריכת אימון">
        <SessionForm
          initial={initial}
          levels={levels}
          mode={{ type: 'edit', sessionId }}
          onDone={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="ביטול האימון"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>חזרה
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                run(() => cancelSessionAction({ sessionId, reason }), {
                  success: 'האימון בוטל וההרשמות בוטלו',
                  onSuccess: () => setCancelOpen(false),
                })
              }
            >
              בטלי את האימון
            </Button>
          </>
        }
      >
        <Alert tone="amber" title="מה יקרה">
          כל ההרשמות הפעילות יבוטלו, האימון לא יימנה במכסה של אף מתאמנת, רשימת ההמתנה תתרוקן ולא תהיה אפשרות להירשם.
        </Alert>
        <div className="mt-4">
          <Field label="סיבה (אופציונלי)">
            {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Roster                                                               */
/* ------------------------------------------------------------------ */

const ACTIVE: BookingStatus[] = ['CONFIRMED', 'ATTENDED', 'NO_SHOW'];

export function Roster({ roster, hasStarted, levels }: { roster: RosterEntry[]; hasStarted: boolean; levels: SkillLevel[] }) {
  const { pending, run } = useServerAction();
  const [restoreFor, setRestoreFor] = useState<RosterEntry | null>(null);
  const [removeFor, setRemoveFor] = useState<RosterEntry | null>(null);
  const [unmarkFor, setUnmarkFor] = useState<RosterEntry | null>(null);
  const [reason, setReason] = useState('');

  const active = roster.filter((r) => ACTIVE.includes(r.status));
  const history = roster.filter((r) => !ACTIVE.includes(r.status));

  const setStatus = (bookingId: string, status: BookingStatus, success: string) =>
    run(() => setBookingStatusAction({ bookingId, status }), { success });

  return (
    <section aria-labelledby="roster" className="flex flex-col gap-3">
      <h2 id="roster" className="text-card font-semibold">
        רשומות ({active.length})
      </h2>
      {active.length === 0 ? <p className="text-small text-muted">אין רשומות לאימון.</p> : null}
      <div className="flex flex-col gap-2">
        {active.map((r) => (
          <Card key={r.booking_id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{r.member?.full_name ?? '-'}</p>
                <p className="text-caption text-muted" dir="ltr">
                  {formatIsraeliPhone(r.member?.phone)}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {r.skill_override ? <Badge tone="amber">חריגת רמה</Badge> : null}
                <SkillLevelBadge label={levelLabel(r.member?.skill_level_code, levels)} />
                <BookingStatusBadge status={r.status} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasStarted && r.status !== 'ATTENDED' ? (
                <Button size="sm" variant="soft" loading={pending} onClick={() => setStatus(r.booking_id, 'ATTENDED', 'סומנה כהשתתפה')}>
                  השתתפה
                </Button>
              ) : null}
              {hasStarted && r.status !== 'NO_SHOW' ? (
                <Button size="sm" variant="secondary" loading={pending} onClick={() => setStatus(r.booking_id, 'NO_SHOW', 'סומנה כלא הגיעה')}>
                  לא הגיעה
                </Button>
              ) : null}
              {r.status !== 'CONFIRMED' ? (
                <Button size="sm" variant="ghost" loading={pending} onClick={() => setUnmarkFor(r)}>
                  ביטול סימון
                </Button>
              ) : null}
              {r.status === 'NO_SHOW' ? (
                <Button size="sm" variant="ghost" onClick={() => setRestoreFor(r)}>
                  החזרת אימון למכסה
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setRemoveFor(r)}>
                הסרה מהאימון
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {history.length > 0 ? (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-small font-semibold">היסטוריית ביטולים ({history.length})</summary>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {history.map((r) => (
              <li key={r.booking_id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-small">
                <div>
                  <p className="font-medium">{r.member?.full_name ?? '-'}</p>
                  <p className="text-caption text-muted">{r.cancelled_at ? formatInstantHe(r.cancelled_at) : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <BookingStatusBadge status={r.status} />
                  {r.status === 'CANCELLED_LATE' ? (
                    <Button size="sm" variant="ghost" onClick={() => setRestoreFor(r)}>
                      החזרת אימון למכסה
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Modal
        open={Boolean(restoreFor)}
        onClose={() => setRestoreFor(null)}
        title="החזרת אימון למכסה החודשית"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestoreFor(null)}>ביטול
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                restoreFor &&
                run(() => restoreAllowanceAction({ bookingId: restoreFor.booking_id, reason }), {
                  success: 'האימון הוחזר למכסה. הפעולה נרשמה ביומן.',
                  onSuccess: () => {
                    setRestoreFor(null);
                    setReason('');
                  },
                })
              }
            >
              החזרה למכסה
            </Button>
          </>
        }
      >
        <p className="mb-3">
          ל{restoreFor?.member?.full_name ?? ''} תתווסף התאמה של +1 למכסה באותו חודש. סטטוס ההרשמה המקורי לא ישתנה, וההתאמה תתועד ביומן הפעולות.
        </p>
        <Field label="סיבה (חובה)">{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}</Field>
      </Modal>

      <Modal
        open={Boolean(unmarkFor)}
        onClose={() => setUnmarkFor(null)}
        title="ביטול סימון"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnmarkFor(null)}>
              חזרה
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                unmarkFor &&
                run(() => setBookingStatusAction({ bookingId: unmarkFor.booking_id, status: 'CONFIRMED' }), {
                  success: 'הסימון בוטל',
                  onSuccess: () => setUnmarkFor(null),
                })
              }
            >
              ביטול סימון
            </Button>
          </>
        }
      >
        <p>הסימון של {unmarkFor?.member?.full_name ?? ''} יבוטל וההרשמה תחזור לסטטוס &quot;רשומה&quot;.</p>
      </Modal>

      <Modal
        open={Boolean(removeFor)}
        onClose={() => setRemoveFor(null)}
        title="הסרה מהאימון"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveFor(null)}>ביטול
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                removeFor &&
                run(() => setBookingStatusAction({ bookingId: removeFor.booking_id, status: 'CANCELLED_BY_COACH' }), {
                  success: 'המתאמנת הוסרה. האימון לא נספר במכסה שלה.',
                  onSuccess: () => setRemoveFor(null),
                })
              }
            >
              הסרה
            </Button>
          </>
        }
      >
        <p>
          {removeFor?.member?.full_name} תוסר מהאימון, המקום יתפנה והאימון <strong>לא</strong> ייספר במכסה החודשית שלה.
        </p>
      </Modal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Manual assignment                                                    */
/* ------------------------------------------------------------------ */

export function AssignForm({
  sessionId,
  members,
  assignedIds,
  isFull,
  levels,
  disabled,
}: {
  sessionId: string;
  members: { id: string; full_name: string; skill_level_code: string | null }[];
  assignedIds: string[];
  isFull: boolean;
  levels: SkillLevel[];
  disabled: boolean;
}) {
  const [memberId, setMemberId] = useState('');
  const [override, setOverride] = useState(false);
  const [note, setNote] = useState('');
  const { pending, run } = useServerAction();
  const options = members.filter((m) => !assignedIds.includes(m.id));

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-card font-semibold">הוספת מתאמנת לאימון</h2>
      {isFull ? (
        <Alert tone="amber">האימון מלא. אי אפשר לעבור את הקיבולת - אפשר להגדיל אותה בעריכת האימון.</Alert>
      ) : null}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => assignBookingAction({ sessionId, memberId, overrideSkill: override, note }), {
            success: 'המתאמנת נוספה לאימון',
            onSuccess: () => {
              setMemberId('');
              setNote('');
              setOverride(false);
            },
          });
        }}
      >
        <Field label="מתאמנת">
          {(p) => (
            <Select {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)} required disabled={disabled || isFull}>
              <option value="">בחרי…</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} · {levelLabel(m.skill_level_code, levels)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Checkbox label="אישור חריגה מרמת האימון" checked={override} onChange={(e) => setOverride(e.target.checked)} />
        <Field label="הערה (אופציונלי)">{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}</Field>
        <Button type="submit" loading={pending} disabled={!memberId || disabled || isFull} className="self-start">
          הוספה
        </Button>
        <p className="text-caption text-muted">המכסה החודשית של המתאמנת והקיבולת נבדקות גם בשיבוץ ידני. אפשר להוסיף התאמה במכסה בפרופיל המתאמנת.</p>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Waiting list                                                         */
/* ------------------------------------------------------------------ */

export function Waitlist({ entries, isFull }: { entries: WaitlistRow[]; isFull: boolean }) {
  const { pending, run } = useServerAction();
  const [removeEntry, setRemoveEntry] = useState<WaitlistRow | null>(null);
  const waiting = entries.filter((e) => e.status === 'WAITING');
  const past = entries.filter((e) => e.status !== 'WAITING');

  return (
    <section aria-labelledby="waitlist" className="flex flex-col gap-3">
      <h2 id="waitlist" className="text-card font-semibold">
        רשימת המתנה ({waiting.length})
      </h2>
      {waiting.length === 0 ? <p className="text-small text-muted">אין ממתינות.</p> : null}
      {waiting.length > 0 && isFull ? (
        <p className="text-caption text-muted">האימון מלא כרגע. כשיתפנה מקום אפשר לשבץ את הראשונה בתור.</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {waiting.map((e) => (
          <Card key={e.entry_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-pink-100 text-small font-semibold text-pink-700">{e.position}</span>
              <div>
                <p className="font-semibold">{e.member?.full_name ?? '-'}</p>
                <p className="text-caption text-muted">הצטרפה {formatInstantHe(e.joined_at)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" loading={pending} disabled={isFull} onClick={() => run(() => promoteWaitlistAction({ entryId: e.entry_id }), { success: 'שובצה לאימון' })}>
                שיבוץ לאימון
              </Button>
              <Button size="sm" variant="ghost" loading={pending} onClick={() => setRemoveEntry(e)}>
                הסרה
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {past.length > 0 ? (
        <p className="text-caption text-muted">
          היסטוריה: {past.map((e) => `${e.member?.full_name ?? '-'} (${WAITLIST_STATUS_LABEL_HE[e.status]})`).join(' · ')}
        </p>
      ) : null}

      <Modal
        open={Boolean(removeEntry)}
        onClose={() => setRemoveEntry(null)}
        title="הסרה מרשימת ההמתנה"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveEntry(null)}>
              חזרה
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                removeEntry &&
                run(() => removeWaitlistAction({ entryId: removeEntry.entry_id }), {
                  success: 'הוסרה מהרשימה',
                  onSuccess: () => setRemoveEntry(null),
                })
              }
            >
              הסרה
            </Button>
          </>
        }
      >
        <p>{removeEntry?.member?.full_name ?? ''} תוסר מרשימת ההמתנה ותאבד את מקומה בתור.</p>
      </Modal>
    </section>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-flex items-center gap-1 text-small text-muted hover:text-ink">
      → {children}
    </Link>
  );
}
