'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { saveEventAction } from '@/app/admin/events/actions';
import { prepareEventImage } from '@/components/admin/image-compress';
import { DeleteEventButton } from '@/components/admin/event-actions';
import { PreviewBar } from '@/components/admin/preview-bar';
import { EventDetails } from '@/components/events/event-details';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { useServerAction } from '@/components/use-server-action';
import { buildPreviewEvent } from '@/lib/domain/event-preview';
import { WHEN_END_NEEDS_DATE } from '@/lib/domain/event-when';
import { nowMs } from '@/lib/now';
import {
  EVENT_DESCRIPTION_MAX,
  EVENT_IMAGE_ACCEPT,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_LOCATION_MAX,
  EVENT_TITLE_MAX,
  isEventPast,
  type EventStatus,
  type EventView,
} from '@/lib/domain/events';

/** Splits a `YYYY-MM-DDTHH:mm` value into `[date, time]` (both empty when there is no value). */
function splitLocal(value: string): [string, string] {
  const [date = '', time = ''] = value.split('T');
  return [date, time.slice(0, 5)];
}

export interface EventFormInitial {
  title: string;
  description: string;
  /** `datetime-local` values in Israel time; a bare `YYYY-MM-DD` when only the date is known (date-only draft). */
  startsAt: string;
  endsAt: string;
  location: string;
  status: EventStatus;
  imageUrl: string | null;
}

/**
 * Create or edit a community event. Attendance confirmations are collected on the event page,
 * not as a capacity setting here. An RSVP never touches the monthly training quota.
 */
export function EventForm({
  initial,
  mode,
  header,
}: {
  initial: EventFormInitial;
  mode: { type: 'create' } | { type: 'edit'; eventId: string; title: string };
  /** Page heading shown above the form (hidden while previewing, so the preview looks like the real page). */
  header?: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [startDate, startTime] = splitLocal(initial.startsAt);
  const [initialEndDate, endTime] = splitLocal(initial.endsAt);
  const [values, setValues] = useState({
    title: initial.title,
    description: initial.description,
    date: startDate,
    // Only for an event that spans several days. Empty = the event ends the same day.
    endDate: initialEndDate && initialEndDate !== startDate ? initialEndDate : '',
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
  // The event as trainees would see it, built from the unsaved form values. Never sent anywhere.
  const [previewing, setPreviewing] = useState<{ event: EventView; past: boolean } | null>(null);
  const { pending, run } = useServerAction();

  // Release the object URL of the previous image preview when it changes and on unmount.
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

  /**
   * The values (Israel time) behind the date, end date and the two time fields: `datetime-local` values when
   * a time was entered, a bare date when it was not (the event is then shown with "השעה תפורסם בהמשך"), and
   * empty when there is no date yet (a draft; the server refuses to publish it). A time is never made up.
   */
  function composeDateTimes() {
    if (!values.date) return { startsAt: '', endsAt: '' };
    const endDate = values.endDate && values.endDate !== values.date ? values.endDate : '';
    return {
      startsAt: values.startTime ? `${values.date}T${values.startTime}` : values.date,
      endsAt: values.endTime ? `${endDate || values.date}T${values.endTime}` : endDate,
    };
  }

  /** A time or an end date without a date cannot be stored: say so instead of silently dropping it. */
  function missingDate() {
    return !values.date && Boolean(values.startTime || values.endTime || values.endDate);
  }

  function openPreview() {
    setError(undefined);
    if (!formRef.current?.reportValidity()) return;
    if (missingDate()) {
      setError(WHEN_END_NEEDS_DATE);
      return;
    }
    // Validated like a save, but a draft does not need a description yet.
    const result = buildPreviewEvent(
      { title: values.title, description: values.description, location: values.location, ...composeDateTimes() },
      wasPublished ? 'PUBLISHED' : 'DRAFT',
      shownImage,
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPreviewing({ event: result.event, past: isEventPast(result.event, nowMs()) });
    window.scrollTo({ top: 0 });
  }

  function closePreview() {
    setError(undefined);
    setPreviewing(null);
    window.scrollTo({ top: 0 });
  }

  function submit(status: EventStatus) {
    setError(undefined);
    if (missingDate()) {
      setError(WHEN_END_NEEDS_DATE);
      return;
    }
    const form = new FormData();
    if (mode.type === 'edit') form.set('id', mode.eventId);
    form.set('title', values.title);
    form.set('description', values.description);
    const { startsAt, endsAt } = composeDateTimes();
    form.set('startsAt', startsAt);
    form.set('endsAt', endsAt);
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

  const formElement = (
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="תאריך" hint="לפי שעון ישראל. נדרש כדי לפרסם; בלי תאריך האירוע נשמר כטיוטה.">
          {(p) => <Input {...p} type="date" value={values.date} onChange={(e) => set('date', e.target.value)} />}
        </Field>
        <Field label="תאריך סיום (אופציונלי)" hint="רק לאירוע שנמשך כמה ימים">
          {(p) => <Input {...p} type="date" value={values.endDate} min={values.date || undefined} onChange={(e) => set('endDate', e.target.value)} />}
        </Field>
        <Field label="שעת התחלה (אופציונלי)" hint="אם אין שעה, תוצג למתאמנות ״השעה תפורסם בהמשך״.">
          {(p) => <Input {...p} type="time" value={values.startTime} onChange={(e) => set('startTime', e.target.value)} />}
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
        <Button type="button" variant="ghost" disabled={pending || preparing} onClick={openPreview}>
          תצוגה מקדימה
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

  return (
    <>
      {previewing ? (
        <div>
          <PreviewBar
            description={
              wasPublished
                ? 'כך ייראו השינויים. הם עוד לא נשמרו, והאירוע המפורסם לא השתנה.'
                : 'כך ייראה האירוע. הוא עוד לא נשמר ולא מוצג למתאמנות.'
            }
          >
            <Button size="sm" variant="secondary" disabled={pending} onClick={closePreview}>
              חזרה לעריכה
            </Button>
            <Button size="sm" loading={pending} onClick={() => submit('PUBLISHED')}>
              {wasPublished ? 'שמירת שינויים' : 'פרסום'}
            </Button>
          </PreviewBar>
          {error ? (
            <p role="alert" className="mx-auto mb-6 max-w-3xl rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-small text-danger">
              {error}
            </p>
          ) : null}
          <EventDetails event={previewing.event} past={previewing.past} preloadImage={false} />
        </div>
      ) : null}
      {/* The form stays mounted (hidden) while previewing so nothing typed or picked is lost. */}
      <div hidden={Boolean(previewing)} className="mx-auto max-w-3xl">
        <div className="flex max-w-2xl flex-col gap-6">
          {header}
          {formElement}
        </div>
      </div>
    </>
  );
}
