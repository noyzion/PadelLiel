'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import { savePlanAction, saveSettingsAction } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { useServerAction } from '@/components/use-server-action';
import type { AppSettings, SubscriptionPlan } from '@/lib/domain/types';

/* ------------------------------------------------------------------ */
/* Plans                                                                */
/* ------------------------------------------------------------------ */

interface PlanDraft {
  id?: string;
  name: string;
  weeklyLimit: number;
  description: string;
  isActive: boolean;
}

const EMPTY_PLAN: PlanDraft = { name: '', weeklyLimit: 1, description: '', isActive: true };

export function PlanManager({ plans, memberCounts }: { plans: SubscriptionPlan[]; memberCounts: Record<string, number> }) {
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [error, setError] = useState<string>();
  const { pending, run } = useServerAction();

  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setError(undefined);
            setDraft(EMPTY_PLAN);
          }}
        >
          תוכנית חדשה
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-small text-muted">{p.weekly_session_limit} אימונים בשבוע</p>
              </div>
              <Badge tone={p.is_active ? 'green' : 'neutral'}>{p.is_active ? 'פעילה' : 'לא פעילה'}</Badge>
            </div>
            {p.description ? <p className="text-small text-muted">{p.description}</p> : null}
            <div className="flex items-center justify-between">
              <span className="text-caption text-muted">{memberCounts[p.id] ?? 0} מנויים פעילים</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setError(undefined);
                  setDraft({ id: p.id, name: p.name, weeklyLimit: p.weekly_session_limit, description: p.description ?? '', isActive: p.is_active });
                }}
              >
                עריכה
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'עריכת תוכנית' : 'תוכנית חדשה'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>ביטול
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                draft &&
                run(() => savePlanAction(draft), {
                  success: 'התוכנית נשמרה',
                  onSuccess: () => setDraft(null),
                  onError: (message) => setError(message),
                })
              }
            >
              שמירה
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="flex flex-col gap-4">
            {error ? (
              <p role="alert" className="rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
                {error}
              </p>
            ) : null}
            <Field label="שם התוכנית">{(p) => <Input {...p} value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={60} />}</Field>
            <Field label="אימונים בשבוע" hint="חל על כל שבוע, ראשון עד שבת. אין צבירה בין שבועות.">
              {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={14} value={draft.weeklyLimit} onChange={(e) => set('weeklyLimit', Number(e.target.value))} />}
            </Field>
            <Field label="תיאור (אופציונלי)">{(p) => <Input {...p} value={draft.description} onChange={(e) => set('description', e.target.value)} maxLength={200} />}</Field>
            <Checkbox label="התוכנית פעילה (אפשר לשייך אותה למתאמנות)" checked={draft.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            {draft.id ? (
              <p className="text-caption text-muted">שינוי מספר האימונים חל על כל המנויים בתוכנית הזו. אימונים שכבר נספרו נשארים נספרים.</p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [cutoff, setCutoff] = useState(settings.cancellation_cutoff_hours);
  const [capacity, setCapacity] = useState(settings.default_capacity);
  const [slots, setSlots] = useState(settings.default_time_slots);
  const [error, setError] = useState<string>();
  const { pending, run } = useServerAction();

  const updateSlot = (index: number, key: 'start' | 'end', value: string) =>
    setSlots((list) => list.map((s, i) => (i === index ? { ...s, [key]: value } : s)));

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        run(() => saveSettingsAction({ cancellationCutoffHours: cutoff, defaultCapacity: capacity, defaultTimeSlots: slots }), {
          success: 'ההגדרות נשמרו',
          onError: (message) => setError(message),
        });
      }}
    >
      {error ? (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        <h2 className="text-card font-semibold">מדיניות ביטולים</h2>
        <Field
          label="שעות לפני האימון לביטול ללא חיוב"
          hint="ביטול עד המועד הזה מחזיר את האימון למכסה. ביטול אחריו משחרר את המקום אבל האימון נשאר נספר. משפיע על ביטולים עתידיים בלבד."
        >
          {(p) => <Input {...p} type="number" inputMode="decimal" min={0} max={168} step="0.5" value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} />}
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-card font-semibold">ברירות מחדל ליצירת אימונים</h2>
        <Field label="קיבולת ברירת מחדל">
          {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={50} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />}
        </Field>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-small font-medium">חלונות זמן</legend>
          {slots.map((slot, i) => (
            <div key={i} className="flex items-end gap-2">
              <Field label="התחלה" className="flex-1">
                {(p) => <Input {...p} type="time" value={slot.start} onChange={(e) => updateSlot(i, 'start', e.target.value)} />}
              </Field>
              <Field label="סיום" className="flex-1">
                {(p) => <Input {...p} type="time" value={slot.end} onChange={(e) => updateSlot(i, 'end', e.target.value)} />}
              </Field>
              <Button
                type="button"
                variant="ghost"
                aria-label="הסרת חלון זמן"
                disabled={slots.length <= 1}
                onClick={() => setSlots((list) => list.filter((_, idx) => idx !== i))}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={slots.length >= 12}
            onClick={() => setSlots((list) => [...list, { start: '09:00', end: '10:00' }])}
          >
            הוספת חלון זמן
          </Button>
        </fieldset>
      </Card>

      <Button type="submit" loading={pending} className="self-start">
        שמירת הגדרות
      </Button>
    </form>
  );
}
