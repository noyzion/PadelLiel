'use server';

import { revalidatePath } from 'next/cache';
import { eventRsvpSchema } from '@/lib/validation/schemas';
import { actionContext } from '@/server/auth';
import { parseInput, runAction, type ActionResult } from '@/server/action';
import { setEventRsvp } from '@/server/services/events';
import type { EventRsvpStatus } from '@/lib/domain/event-rsvp';

function refresh() {
  revalidatePath('/', 'layout');
}

export async function setEventRsvpAction(input: {
  eventId: string;
  status: EventRsvpStatus;
}): Promise<ActionResult<EventRsvpStatus>> {
  return runAction(async () => {
    const { eventId, status } = parseInput(eventRsvpSchema, input);
    const { db } = await actionContext('member');
    const saved = await setEventRsvp(db, eventId, status);
    refresh();
    return saved;
  });
}
