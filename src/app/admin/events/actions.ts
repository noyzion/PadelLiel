'use server';

import { revalidatePath } from 'next/cache';
import { AppError } from '@/lib/domain/errors';
import { checkEventImage } from '@/lib/domain/events';
import { eventIdSchema, eventSaveSchema, eventStatusSchema } from '@/lib/validation/schemas';
import { israelLocalToInstant } from '@/lib/time';
import { actionContext } from '@/server/auth';
import { parseInput, runAction, type ActionResult } from '@/server/action';
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

    const input = {
      title: data.title,
      description: data.description,
      startsAt: israelLocalToInstant(data.startsAt)!.toISOString(),
      endsAt: data.endsAt ? israelLocalToInstant(data.endsAt)!.toISOString() : null,
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
