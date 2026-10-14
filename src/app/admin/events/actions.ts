'use server';

import { revalidatePath } from 'next/cache';
import { AppError } from '@/lib/domain/errors';
import { checkEventImage } from '@/lib/domain/events';
import { isEventImportEnabled } from '@/lib/env';
import { eventIdSchema, eventImportSchema, eventSaveSchema, eventStatusSchema } from '@/lib/validation/schemas';
import { eventWhenColumns, parseEventWhen } from '@/lib/domain/event-when';
import { actionContext } from '@/server/auth';
import { parseInput, runAction, type ActionResult } from '@/server/action';
import { applyAnnualImport, type ImportResult } from '@/server/services/event-import';
import { createEvent, deleteEvent, setEventStatus, updateEvent, type ImageUpload } from '@/server/services/events';

// Community events are informational only (no registration, RSVP, capacity, ...). Staff = approved admins:
// every action re-checks that, and Row Level Security + storage policies enforce it again in the database.

function refresh() {
  revalidatePath('/', 'layout');
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** Reads and validates the optional uploaded cover image (by size and by its real content). */
async function readImage(form: FormData): Promise<ImageUpload | null> {
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkEventImage(bytes.length, bytes.subarray(0, 16));
  if (!check.ok) throw new AppError('INVALID_INPUT', { userMessage: check.message });
  return { bytes, type: check.type };
}

/** Creates (no `id`) or updates (with `id`) an event, optionally adding / replacing / removing its cover image. */
export async function saveEventAction(form: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { db } = await actionContext('admin');
    const data = parseInput(eventSaveSchema, {
      id: text(form, 'id') || undefined,
      title: text(form, 'title'),
      description: text(form, 'description'),
      startsAt: text(form, 'startsAt'),
      endsAt: text(form, 'endsAt'),
      location: text(form, 'location'),
      status: text(form, 'status'),
      removeImage: text(form, 'removeImage') === '1',
    });
    const image = await readImage(form);

    // Timed (needed to publish) or, for an unfinished draft, a date / date range with no clock time.
    const when = parseEventWhen(data.startsAt, data.endsAt, data.status === 'PUBLISHED');
    if (!when.ok) throw new AppError('INVALID_INPUT', { userMessage: when.message });
    const input = {
      title: data.title,
      description: data.description,
      ...eventWhenColumns(when.when),
      location: data.location,
      status: data.status,
    };

    let id: string;
    if (data.id) {
      await updateEvent(db, data.id, input, image, data.removeImage);
      id = data.id;
    } else {
      id = await createEvent(db, input, image);
    }
    refresh();
    return { id };
  });
}

/**
 * Writes the annual community events as DRAFTS. Guarded three times: the caller must be an approved admin, the server
 * operator must have enabled the import (ALLOW_EVENT_IMPORT=1), and the admin must type the confirmation phrase.
 * Only creates missing drafts: existing events are never changed, and nothing is published.
 */
export async function importAnnualEventsAction(input: unknown): Promise<ActionResult<ImportResult>> {
  return runAction(async () => {
    const { db } = await actionContext('admin');
    parseInput(eventImportSchema, input);
    if (!isEventImportEnabled()) {
      throw new AppError('NOT_AUTHORIZED', {
        userMessage: 'הייבוא כבוי בסביבה זו. הגדירי ALLOW_EVENT_IMPORT=1 בשרת, ורק לאחר אישור מפורש.',
      });
    }
    const result = await applyAnnualImport(db);
    refresh();
    return result;
  });
}

export async function setEventStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { eventId, status } = parseInput(eventStatusSchema, input);
    const { db } = await actionContext('admin');
    await setEventStatus(db, eventId, status);
    refresh();
  });
}

export async function deleteEventAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { eventId } = parseInput(eventIdSchema, input);
    const { db } = await actionContext('admin');
    await deleteEvent(db, eventId);
    refresh();
  });
}
