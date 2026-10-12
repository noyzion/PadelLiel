'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { saveEventAction } from '@/app/admin/events/actions';
import { prepareEventImage } from '@/components/admin/image-compress';
import { DeleteEventButton } from '@/components/admin/event-actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { useServerAction } from '@/components/use-server-action';
import {
  EVENT_DESCRIPTION_MAX,
  EVENT_IMAGE_ACCEPT,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_LOCATION_MAX,
  EVENT_TITLE_MAX,
  type EventStatus,
} from '@/lib/domain/events';

/** Splits a `YYYY-MM-DDTHH:mm` value into `[date, time]` (both empty when there is no value). */
function splitLocal(value: string): [string, string] {
  const [date = '', time = ''] = value.split('T');
  return [date, time.slice(0, 5)];
}

export interface EventFormInitial {
  title: string;
  description: string;
  /** `datetime-local` values in Israel time. */
  startsAt: string;
  endsAt: string;
  location: string;
  status: EventStatus;
  imageUrl: string | null;
}

/**
 * Create or edit a community event. The event is informational only: there is deliberately no
 * registration, capacity or attendance setting here.
 */
export function EventForm({ initial, mode }: { initial: EventFormInitial; mode: { type: 'create' } | { type: 'edit'; eventId: string; title: string } }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [startDate, startTime] = splitLocal(initial.startsAt);
  const [initialEndDate, endTime] = splitLocal(initial.endsAt);
  const [values, setValues] = useState({
    title: initial.title,
    description: initial.description,
    date: startDate,
    startTime,
    endTime,
    location: initial.location,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [imageError, setImageError] = useState<string>();
  const [error, setError] = useState<string>();
  const { pending, run } = useServerAction();

  // Release the object URL of the previous preview when it changes and on unmount.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((v) => ({ ...v, [key]: value }));

  const shownImage = preview ?? (removeImage ? null : initial.imageUrl);
  const wasPublished = initial.status === 'PUBLISHED';

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setImageError(undefined);
    if (!EVENT_IMAGE_ACCEPT.split(',').includes(file.type)) {
      setImageError('אפשר להעלות רק תמונות מסוג JPG, PNG או WebP');
      return;
    }
    setPreparing(true);
    try {
      const prepared = await prepareEventImage(file);
      if (prepared.size > EVENT_IMAGE_MAX_BYTES) {
        setImageError(`התמונה גדולה מדי (עד ${EVENT_IMAGE_MAX_BYTES / 1024 / 1024} מ״ב)`);
        return;
      }
      setImageFile(prepared);
      setPreview(URL.createObjectURL(prepared));
      setRemoveImage(false);
    } finally {
      setPreparing(false);
    }
  }

  function clearImage() {
    setImageFile(null);
    setPreview(null);
    setRemoveImage(true);
    setImageError(undefined);
  }

  function submit(status: EventStatus) {
    setError(undefined);
    const form = new FormData();
    if (mode.type === 'edit') form.set('id', mode.eventId);
    form.set('title', values.title);
    form.set('description', values.description);
    form.set('startsAt', `${values.date}T${values.startTime}`);
    // An existing event that spans several days keeps its end date as long as the date isn't changed.
    const endDate = initialEndDate && initialEndDate !== startDate && values.date === startDate ? initialEndDate : values.date;
    form.set('endsAt', values.endTime ? `${endDate}T${values.endTime}` : '');
    form.set('location', values.location);
    form.set('status', status);
    if (imageFile) form.set('image', imageFile, imageFile.name);
    else if (removeImage) form.set('removeImage', '1');

    run(() => saveEventAction(form), {
      success: status === 'DRAFT' ? (wasPublished ? 'פרסום האירוע בוטל' : 'הטיוטה נשמרה') : wasPublished ? 'האירוע עודכן' : 'האירוע פורסם',
      onSuccess: () => router.push('/admin/events'),
      onError: (message) => setError(message),
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit('PUBLISHED');
      }}
      className="flex flex-col gap-5"
    >
      {error ? (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
          {error}
        </p>
      ) : null}

      <Field label="כותרת האירוע">
        {(p) => <Input {...p} value={values.title} onChange={(e) => set('title', e.target.value)} maxLength={EVENT_TITLE_MAX} required />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="תאריך" hint="לפי שעון ישראל">
          {(p) => <Input {...p} type="date" value={values.date} onChange={(e) => set('date', e.target.value)} required />}
        </Field>
        <Field label="שעת התחלה">
          {(p) => <Input {...p} type="time" value={values.startTime} onChange={(e) => set('startTime', e.target.value)} required />}
        </Field>
        <Field label="שעת סיום (אופציונלי)">
          {(p) => <Input {...p} type="time" value={values.endTime} onChange={(e) => set('endTime', e.target.value)} />}
        </Field>
      </div>

      <Field label="מיקום">
        {(p) => <Input {...p} value={values.location} onChange={(e) => set('location', e.target.value)} maxLength={EVENT_LOCATION_MAX} required />}
      </Field>

      <Field label="תיאור" hint="כדי להפריד בין פסקאות, השאירי שורה ריקה ביניהן. התיאור נדרש כדי לפרסם את האירוע.">
        {(p) => (
          <Textarea {...p} value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={EVENT_DESCRIPTION_MAX} className="min-h-56" />
        )}
      </Field>

      <div className="flex flex-col gap-3">
        <p className="text-small font-semibold text-navy-900">תמונה (אופציונלי)</p>
        {shownImage ? (
          <div className="relative aspect-[16/10] w-full max-w-sm overflow-hidden rounded-card border border-line bg-pink-100">
            <Image src={shownImage} alt="תצוגה מקדימה של תמונת האירוע" fill sizes="24rem" unoptimized={Boolean(preview)} className="object-cover" />
          </div>
        ) : null}
        <input ref={fileRef} type="file" accept={EVENT_IMAGE_ACCEPT} onChange={onPickImage} className="sr-only" tabIndex={-1} aria-hidden="true" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" loading={preparing} onClick={() => fileRef.current?.click()}>
            {shownImage ? 'החלפת תמונה' : 'בחירת תמונה'}
          </Button>
          {shownImage ? (
            <Button type="button" size="sm" variant="ghost" onClick={clearImage}>
              הסרת התמונה
            </Button>
          ) : null}
        </div>
        {imageError ? (
          <p role="alert" className="text-small font-medium text-danger">
            {imageError}
          </p>
        ) : (
          <p className="text-caption text-muted">JPG, PNG או WebP, עד 4 מ״ב. מומלץ תמונה לרוחב. תמונות גדולות מוקטנות אוטומטית.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button type="submit" loading={pending} disabled={preparing}>
          {wasPublished ? 'שמירת שינויים' : 'פרסום'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || preparing}
          onClick={() => {
            if (formRef.current?.reportValidity()) submit('DRAFT');
          }}
        >
          {wasPublished ? 'ביטול פרסום' : 'שמירה כטיוטה'}
        </Button>
        {mode.type === 'edit' ? (
          <span className="ms-auto">
            <DeleteEventButton eventId={mode.eventId} title={mode.title} redirectTo="/admin/events" />
          </span>
        ) : null}
      </div>
      {wasPublished ? (
        <p className="-mt-2 text-caption text-muted">״ביטול פרסום״ שומר את השינויים כטיוטה, והאירוע מוסתר מהמתאמנות מיד.</p>
      ) : null}
    </form>
  );
}
