'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  adjustAllowanceAction,
  assignSubscriptionAction,
  deleteMemberAction,
  resetMemberPasswordAction,
  setSubscriptionActiveAction,
  setSubscriptionValidityAction,
  updateMemberAction,
} from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useServerAction } from '@/components/use-server-action';
import { APPROVAL_LABEL_HE, APPROVAL_TONE } from '@/lib/domain/labels';
import type { ApprovalStatus, SkillLevel, SubscriptionPlan } from '@/lib/domain/types';
import { formatDateHe, formatMonthCycleHe, formatMonthHe, monthStartOf } from '@/lib/time';

/* ------------------------------------------------------------------ */
/* Profile: approval, level, notes                                      */
/* ------------------------------------------------------------------ */

export function MemberProfileEditor({
  memberId,
  approval,
  level,
  notes,
  levels,
}: {
  memberId: string;
  approval: ApprovalStatus;
  level: string | null;
  notes: string;
  levels: SkillLevel[];
}) {
  const [levelValue, setLevelValue] = useState(level ?? '');
  const [notesValue, setNotesValue] = useState(notes);
  const { pending, run } = useServerAction();

  const setApproval = (next: ApprovalStatus, success: string) =>
    run(() => updateMemberAction({ memberId, patch: { approval_status: next } }), { success });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-card font-semibold">פרטים וסטטוס</h2>
        <Badge tone={APPROVAL_TONE[approval]}>{APPROVAL_LABEL_HE[approval]}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {approval !== 'approved' ? (
          <Button
            size="sm"
            loading={pending}
            onClick={() => setApproval('approved', approval === 'inactive' ? 'המתאמנת הופעלה מחדש' : 'המתאמנת אושרה')}
          >
            {approval === 'inactive' ? 'הפעלה מחדש' : 'אישור'}
          </Button>
        ) : null}
        {approval === 'approved' ? (
          <Button size="sm" variant="secondary" loading={pending} onClick={() => setApproval('inactive', 'המתאמנת הוגדרה כלא פעילה')}>
            הגדרה כלא פעילה
          </Button>
        ) : null}
        {approval === 'pending' ? (
          <Button size="sm" variant="secondary" loading={pending} onClick={() => setApproval('rejected', 'הבקשה נדחתה')}>
            דחייה
          </Button>
        ) : null}
        {approval === 'approved' ? (
          <Button size="sm" variant="ghost" loading={pending} onClick={() => setApproval('pending', 'הוחזרה לממתינות')}>
            החזרה להמתנה
          </Button>
        ) : null}
      </div>
      {approval === 'inactive' ? (
        <p className="text-small text-muted">מתאמנת לא פעילה לא יכולה להיכנס לאפליקציה או להירשם לאימונים. כל הנתונים וההיסטוריה נשמרים.</p>
      ) : null}
      {approval === 'approved' ? (
        <p className="text-caption text-muted">
          הגדרה כלא פעילה לא מבטלת אימונים קרובים שהיא כבר רשומה אליהם. את אלה אפשר להסיר מעמוד האימון.
        </p>
      ) : null}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateMemberAction({ memberId, patch: { skill_level_code: levelValue, admin_notes: notesValue } }), {
            success: 'הפרטים נשמרו',
          });
        }}
      >
        <Field label="רמה" hint="יכולה להירשם לאימונים ברמה שלה או נמוכה יותר, לא לרמה גבוהה יותר.">
          {(p) => (
            <Select {...p} value={levelValue} onChange={(e) => setLevelValue(e.target.value)}>
              <option value="">ללא רמה</option>
              {levels.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label_he}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="הערות פנימיות" hint="גלויות למאמנת בלבד.">
          {(p) => <Textarea {...p} value={notesValue} onChange={(e) => setNotesValue(e.target.value)} maxLength={2000} />}
        </Field>
        <Button type="submit" loading={pending} className="self-start">
          שמירה
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Reset password                                                       */
/* ------------------------------------------------------------------ */

/**
 * For a trainee who forgot her password and contacted the coach. The temporary password exists only in this
 * component's memory: it is shown once and gone when the dialog closes.
 */
export function ResetPasswordCard({ memberId, memberName }: { memberId: string; memberName: string }) {
  const toast = useToast();
  const { pending, run } = useServerAction();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState<string | null>(null);

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success('הסיסמה הועתקה');
    } catch {
      toast.error('לא הצלחנו להעתיק. אפשר לסמן את הסיסמה ולהעתיק ידנית.');
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-card font-semibold">איפוס סיסמה</h2>
      <p className="text-small text-muted">
        אם המתאמנת שכחה את הסיסמה ופנתה אלייך: אחרי שוידאת שזו באמת היא, אפשר ליצור לה סיסמה זמנית ולמסור אותה בשיחה או באופן אישי.
      </p>
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setConfirming(true)}>
        איפוס סיסמה
      </Button>

      <Modal
        open={confirming}
        onClose={() => {
          if (!pending) setConfirming(false);
        }}
        title="לאפס את הסיסמה?"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              ביטול
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(() => resetMemberPasswordAction({ memberId }), {
                  onSuccess: (data) => {
                    setConfirming(false);
                    setPassword(data.password);
                  },
                  onError: (message) => {
                    setConfirming(false);
                    toast.error(message);
                  },
                })
              }
            >
              יצירת סיסמה זמנית
            </Button>
          </>
        }
      >
        <p className="text-body">
          הסיסמה הנוכחית של {memberName} תתבטל, והיא תנותק מכל המכשירים. ודאי שזו באמת היא לפני שאת ממשיכה.
        </p>
      </Modal>

      <Modal
        open={password !== null}
        onClose={() => setPassword(null)}
        title="הסיסמה הזמנית"
        footer={
          <>
            <Button variant="secondary" onClick={copy}>
              העתקה
            </Button>
            <Button onClick={() => setPassword(null)}>סיום</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-body">
            מסרי את הסיסמה ל{memberName} בשיחה או באופן אישי, ולא בהודעה שנשארת. היא תופיע רק עכשיו, ואחרי הסגירה אי אפשר לראות אותה שוב.
          </p>
          <p
            dir="ltr"
            className="select-all rounded-control border border-line bg-canvas px-4 py-3 text-center font-mono text-title font-semibold tracking-widest"
          >
            {password}
          </p>
          <p className="text-small text-muted">בקשי ממנה להיכנס ומיד לשנות לסיסמה משלה: פרופיל, ואז &quot;שינוי סיסמה&quot;.</p>
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Delete                                                               */
/* ------------------------------------------------------------------ */

export function DeleteMemberCard({ memberId, memberName, hasHistory }: { memberId: string; memberName: string; hasHistory: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { pending, run } = useServerAction();
  const [open, setOpen] = useState(false);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-card font-semibold">מחיקת מתאמנת</h2>
      {hasHistory ? (
        <p className="text-small text-muted">
          למתאמנת יש היסטוריית אימונים או התאמות מכסה, ולכן אי אפשר למחוק אותה. כדי להסיר אותה מהשימוש, הגדירי אותה כלא פעילה.
        </p>
      ) : (
        <p className="text-small text-muted">מוחקת את החשבון, המנוי ורישומי ההמתנה של המתאמנת. אי אפשר לשחזר.</p>
      )}
      <Button variant="danger" size="sm" className="self-start" disabled={hasHistory} onClick={() => setOpen(true)}>
        מחיקה
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="למחוק את המתאמנת?"
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                run(() => deleteMemberAction({ memberId }), {
                  success: 'המתאמנת נמחקה',
                  onSuccess: () => router.replace('/admin/members'),
                  onError: (message) => {
                    setOpen(false);
                    toast.error(message);
                  },
                })
              }
            >
              מחיקה סופית
            </Button>
          </>
        }
      >
        <p className="text-body">
          {memberName} תימחק לצמיתות, כולל החשבון והמנוי שלה. לא ניתן לשחזר.
        </p>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Subscription                                                         */
/* ------------------------------------------------------------------ */

export interface SubscriptionView {
  id: string;
  plan_name: string;
  monthly_limit: number;
  is_active: boolean;
  /** Replaced by a newer subscription (still in force until its end date). */
  superseded: boolean;
  starts_on: string;
  ends_on: string | null;
}

export function SubscriptionManager({
  memberId,
  subscriptions,
  plans,
  today,
}: {
  memberId: string;
  subscriptions: SubscriptionView[];
  plans: SubscriptionPlan[];
  today: string;
}) {
  const { pending, run } = useServerAction();
  const [planId, setPlanId] = useState('');
  const [startsOn, setStartsOn] = useState(monthStartOf(today));
  const [editing, setEditing] = useState<SubscriptionView | null>(null);
  const [editStart, setEditStart] = useState('');

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-card font-semibold">מנוי</h2>

      {subscriptions.length === 0 ? <p className="text-small text-muted">אין מנוי. בלי מנוי פעיל אי אפשר להירשם לאימונים.</p> : null}
      <ul className="flex flex-col divide-y divide-line">
        {subscriptions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-small">
            <div>
              <p className="font-semibold">
                {s.plan_name} · {s.monthly_limit} בחודש
              </p>
              <p className="text-caption text-muted">
                מ-{formatDateHe(s.starts_on)}
                {s.ends_on ? ` עד ${formatDateHe(s.ends_on)}` : ' · מתחדש ב־1 בכל חודש'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={s.is_active ? 'green' : 'neutral'}>{s.is_active ? 'פעיל' : s.superseded ? 'הוחלף' : 'מושבת'}</Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(s);
                  setEditStart(s.starts_on);
                }}
              >
                תאריכים
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={pending}
                onClick={() =>
                  run(() => setSubscriptionActiveAction({ subscriptionId: s.id, active: !s.is_active }), {
                    success: s.is_active ? 'המנוי הושבת' : 'המנוי הופעל',
                  })
                }
              >
                {s.is_active ? 'השבתה' : 'הפעלה'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <form
        className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => assignSubscriptionAction({ memberId, planId, startsOn: startsOn || undefined }), {
            success: 'המנוי עודכן',
            onSuccess: () => {
              setPlanId('');
              setStartsOn(monthStartOf(today));
            },
          });
        }}
      >
        <p className="text-small font-semibold">שיוך או החלפת מנוי</p>
        <Field label="תוכנית">
          {(p) => (
            <Select {...p} value={planId} onChange={(e) => setPlanId(e.target.value)} required>
              <option value="">בחרי תוכנית…</option>
              {plans
                .filter((pl) => pl.is_active)
                .map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} ({pl.monthly_session_limit} בחודש)
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="תחילה" hint="נספר מתחילת החודש (ה־1)">
          {(p) => <Input {...p} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}
        </Field>
        <Button type="submit" loading={pending} disabled={!planId} className="self-start">
          שמירת מנוי
        </Button>
        <p className="text-caption text-muted">
          המנוי חודשי לכולן: {formatMonthCycleHe(today)} וכן הלאה. תאריך באמצע חודש נספר מה־1, והמכסה מתחדשת אוטומטית כל 1 בחודש.
          החלפת תוכנית לא מאפסת אימונים שכבר נספרו באותו חודש.
        </p>
      </form>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="תחילת המנוי"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>ביטול
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                editing &&
                run(
                  () =>
                    setSubscriptionValidityAction({
                      subscriptionId: editing.id,
                      startsOn: editStart,
                      endsOn: editing.ends_on ?? undefined,
                    }),
                  {
                    success: 'התאריכים עודכנו',
                    onSuccess: () => setEditing(null),
                  },
                )
              }
            >
              שמירה
            </Button>
          </>
        }
      >
        <Field label="תחילה" hint="נספר מתחילת החודש (ה־1)">
          {(p) => <Input {...p} type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />}
        </Field>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Manual allowance adjustment                                          */
/* ------------------------------------------------------------------ */

export function AllowanceAdjustForm({ memberId, months }: { memberId: string; months: string[] }) {
  const [monthStart, setMonthStart] = useState(months[0] ?? '');
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('');
  const { pending, run } = useServerAction();

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-card font-semibold">התאמת מכסה ידנית</h2>
      <p className="text-small text-muted">מוסיפה (או מורידה) אימונים למכסה של חודש מסוים. ההתאמה נרשמת ביומן הפעולות.</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => adjustAllowanceAction({ memberId, monthStart, delta, reason }), {
            success: 'המכסה עודכנה',
            onSuccess: () => setReason(''),
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="חודש">
            {(p) => (
              <Select {...p} value={monthStart} onChange={(e) => setMonthStart(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthHe(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="שינוי (+/−)">
            {(p) => <Input {...p} type="number" inputMode="numeric" min={-31} max={31} value={delta} onChange={(e) => setDelta(Number(e.target.value))} required />}
          </Field>
        </div>
        <Field label="סיבה (חובה)">{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required />}</Field>
        <Button type="submit" loading={pending} disabled={!delta || reason.trim().length < 3} className="self-start">
          החלה
        </Button>
      </form>
    </Card>
  );
}
