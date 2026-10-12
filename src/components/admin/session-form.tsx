'use client';

import { useState } from 'react';
import { createSessionAction, updateSessionAction } from '@/app/admin/actions';
import { useServerAction } from '@/components/use-server-action';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import type { SkillLevel } from '@/lib/domain/types';

export interface SessionFormInitial {
  date: string;
  start: string;
  end: string;
  level: string;
  capacity: number;
  registrationOpen: boolean;
  notes: string;
}

/** Create (as a draft) or edit one session. Booking-related edit rules are enforced by the database. */
export function SessionForm({
  initial,
  levels,
  mode,
  onDone,
}: {
  initial: SessionFormInitial;
  levels: SkillLevel[];
  mode: { type: 'create' } | { type: 'edit'; sessionId: string };
  onDone?: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string>();
  const { pending, run } = useServerAction();

  const set = <K extends keyof SessionFormInitial>(key: K, value: SessionFormInitial[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    run(
      async () => {
        const result =
          mode.type === 'create'
            ? await createSessionAction(values)
            : await updateSessionAction({ sessionId: mode.sessionId, form: values });
        return result.ok ? ({ ok: true, data: undefined } as const) : result;
      },
      {
        success: mode.type === 'create' ? 'האימון נוצר כטיוטה' : 'האימון עודכן',
        onSuccess: () => onDone?.(),
        onError: (message) => setError(message),
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error}
        </p>
      ) : null}
      <Field label="תאריך">
        {(p) => <Input {...p} type="date" value={values.date} onChange={(e) => set('date', e.target.value)} required />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="שעת התחלה">
          {(p) => <Input {...p} type="time" value={values.start} onChange={(e) => set('start', e.target.value)} required />}
        </Field>
        <Field label="שעת סיום">
          {(p) => <Input {...p} type="time" value={values.end} onChange={(e) => set('end', e.target.value)} required />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="רמה">
          {(p) => (
            <Select {...p} value={values.level} onChange={(e) => set('level', e.target.value)}>
              {levels.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label_he}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="קיבולת מקסימלית">
          {(p) => (
            <Input {...p} type="number" min={1} max={50} inputMode="numeric" value={values.capacity} onChange={(e) => set('capacity', Number(e.target.value))} required />
          )}
        </Field>
      </div>
      <Checkbox label="ההרשמה פתוחה" checked={values.registrationOpen} onChange={(e) => set('registrationOpen', e.target.checked)} />
      <Field label="הערות (אופציונלי)">
        {(p) => <Textarea {...p} value={values.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} />}
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        {mode.type === 'create' ? 'יצירת אימון' : 'שמירת שינויים'}
      </Button>
    </form>
  );
}
