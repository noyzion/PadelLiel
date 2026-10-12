'use client';

import { useState } from 'react';
import {
  createSessionsBulkAction,
  duplicateWeekAction,
  publishSessionsAction,
} from '@/app/admin/actions';
import { SessionForm } from '@/components/admin/session-form';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useServerAction } from '@/components/use-server-action';
import type { SkillLevel } from '@/lib/domain/types';
import { WEEKDAY_NAMES_HE, addDays, formatDayMonth, shiftWeek } from '@/lib/time';

interface Slot {
  start: string;
  end: string;
}

export function ScheduleTools({
  weekStart,
  draftIds,
  defaultSlots,
  defaultCapacity,
  levels,
  sessionCount,
}: {
  weekStart: string;
  draftIds: string[];
  defaultSlots: Slot[];
  defaultCapacity: number;
  levels: SkillLevel[];
  sessionCount: number;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [singleOpen, setSingleOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const { pending, run } = useServerAction();

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setBulkOpen(true)}>
        יצירת אימונים לשבוע
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setSingleOpen(true)}>
        אימון בודד
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setDupOpen(true)}>
        שכפול משבוע קודם
      </Button>
      <Button
        size="sm"
        variant="soft"
        disabled={draftIds.length === 0}
        loading={pending}
        onClick={() =>
          run(() => publishSessionsAction({ sessionIds: draftIds }), {
            success: (d) => `פורסמו ${d.published} אימונים. המתאמנות יכולות להירשם.`,
          })
        }
      >
        פרסום כל הטיוטות {draftIds.length > 0 ? `(${draftIds.length})` : ''}
      </Button>

      <BulkCreateModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        weekStart={weekStart}
        defaultSlots={defaultSlots}
        defaultCapacity={defaultCapacity}
        levels={levels}
      />

      <Modal open={singleOpen} onClose={() => setSingleOpen(false)} title="אימון בודד">
        <SessionForm
          levels={levels}
          mode={{ type: 'create' }}
          initial={{
            date: weekStart,
            start: defaultSlots[0]?.start ?? '07:00',
            end: defaultSlots[0]?.end ?? '08:00',
            level: levels[0]?.code ?? 'beginner',
            capacity: defaultCapacity,
            registrationOpen: true,
            notes: '',
          }}
          onDone={() => setSingleOpen(false)}
        />
      </Modal>

      <Modal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title="שכפול משבוע קודם"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDupOpen(false)}>
              ביטול
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(() => duplicateWeekAction({ fromWeek: shiftWeek(weekStart, -1), toWeek: weekStart }), {
                  success: (d) => (d.created > 0 ? `נוצרו ${d.created} טיוטות` : 'אין מה לשכפל - האימונים כבר קיימים'),
                  onSuccess: () => setDupOpen(false),
                })
              }
            >
              שכפלי כטיוטות
            </Button>
          </>
        }
      >
        <p>
          האימונים של השבוע הקודם ({formatDayMonth(shiftWeek(weekStart, -1))}-{formatDayMonth(addDays(weekStart, -1))}) יועתקו לשבוע הזה כטיוטות, באותם ימים ושעות.
          אימונים שכבר קיימים באותו זמן לא יוכפלו.
        </p>
        {sessionCount > 0 ? <Alert tone="blue" className="mt-3">בשבוע הזה כבר יש {sessionCount} אימונים.</Alert> : null}
      </Modal>
    </div>
  );
}

function BulkCreateModal({
  open,
  onClose,
  weekStart,
  defaultSlots,
  defaultCapacity,
  levels,
}: {
  open: boolean;
  onClose: () => void;
  weekStart: string;
  defaultSlots: Slot[];
  defaultCapacity: number;
  levels: SkillLevel[];
}) {
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [slots, setSlots] = useState<Slot[]>(defaultSlots);
  const [selectedSlots, setSelectedSlots] = useState<number[]>(defaultSlots.map((_, i) => i));
  const [level, setLevel] = useState<string>(levels[0]?.code ?? '');
  const [capacity, setCapacity] = useState(defaultCapacity);
  const [custom, setCustom] = useState<Slot>({ start: '18:00', end: '19:00' });
  const [error, setError] = useState<string>();
  const { pending, run } = useServerAction();
  const toast = useToast();

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  function submit() {
    setError(undefined);
    run(
      () =>
        createSessionsBulkAction({
          weekStart,
          weekdays,
          slots: selectedSlots.map((i) => slots[i]),
          level,
          capacity,
        }),
      {
        success: (d) => `נוצרו ${d.created} אימונים כטיוטות`,
        onSuccess: () => onClose(),
        onError: (message) => {
          setError(message);
          toast.error(message);
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="יצירת אימונים לשבוע"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={submit} loading={pending}>
            יצירת טיוטות
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error ? <Alert tone="red">{error}</Alert> : null}
        <fieldset>
          <legend className="mb-1 text-small font-semibold text-navy-900">ימים</legend>
          <div className="grid grid-cols-2 gap-x-3">
            {WEEKDAY_NAMES_HE.map((name, i) => (
              <Checkbox
                key={name}
                label={`${name} ${formatDayMonth(addDays(weekStart, i))}`}
                checked={weekdays.includes(i)}
                onChange={() => setWeekdays((w) => toggle(w, i))}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-small font-semibold text-navy-900">שעות</legend>
          {slots.map((slot, i) => (
            <Checkbox
              key={`${slot.start}-${slot.end}`}
              label={`${slot.start}-${slot.end}`}
              checked={selectedSlots.includes(i)}
              onChange={() => setSelectedSlots((s) => toggle(s, i))}
            />
          ))}
          <div className="mt-2 flex items-end gap-2">
            <Field label="התחלה" className="flex-1">
              {(p) => <Input {...p} type="time" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />}
            </Field>
            <Field label="סיום" className="flex-1">
              {(p) => <Input {...p} type="time" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />}
            </Field>
            <Button
              size="md"
              variant="secondary"
              onClick={() => {
                if (!custom.start || !custom.end || custom.end <= custom.start) {
                  toast.error('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
                  return;
                }
                setSlots((s) => [...s, custom]);
                setSelectedSlots((s) => [...s, slots.length]);
              }}
            >
              הוספה
            </Button>
          </div>
        </fieldset>

        <Field label="רמה">
          {(p) => (
            <Select {...p} value={level} onChange={(e) => setLevel(e.target.value)}>
              {levels.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label_he}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="-mt-3 text-caption text-muted">יש מגרש אחד בלבד, לכן בכל שעה נוצר אימון אחד. אפשר לשנות את הרמה של אימון בודד אחרי היצירה.</p>

        <Field label="קיבולת לכל אימון">
          {(p) => <Input {...p} type="number" min={1} max={50} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />}
        </Field>
        <p className="text-caption text-muted">האימונים ייווצרו כטיוטות ולא יהיו גלויים למתאמנות עד לפרסום.</p>
      </div>
    </Modal>
  );
}
