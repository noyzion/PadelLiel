import { describe, expect, it } from 'vitest';
import {
  EVENT_RSVP_PROMPT_TITLE,
  EVENT_RSVP_WINDOW_MS,
  eventRsvpListSummary,
  eventRsvpPromptMessage,
  eventRsvpPromptWhen,
  isEventInRsvpWindow,
} from '@/lib/domain/event-rsvp';
import { eventRsvpSchema } from '@/lib/validation/schemas';

describe('event RSVP copy', () => {
  it('asks to confirm attendance in a warm, specific way', () => {
    expect(EVENT_RSVP_PROMPT_TITLE).toBe('באות?');
    expect(eventRsvpPromptMessage('Padel & Yoga', 'tomorrow')).toBe(
      'מחר יש «Padel & Yoga». נשמח לאישור הגעה, כדי שנדע לחכות לך 💛🎾',
    );
    expect(eventRsvpPromptMessage('Padel & Yoga', 'today')).toBe(
      'היום יש «Padel & Yoga». נשמח לאישור הגעה, כדי שנדע לחכות לך 💛🎾',
    );
    expect(eventRsvpPromptMessage('Padel & Yoga', 'soon')).toBe(
      'עוד מעט יש «Padel & Yoga». נשמח לאישור הגעה, כדי שנדע לחכות לך 💛🎾',
    );
  });

  it('picks today / tomorrow / soon from the Israel calendar date of the start', () => {
    const thursdayMorning = new Date('2026-10-29T07:00:00Z'); // 09:00 Israel
    expect(eventRsvpPromptWhen('2026-10-29T16:00:00Z', thursdayMorning)).toBe('today');
    expect(eventRsvpPromptWhen('2026-10-30T07:00:00Z', thursdayMorning)).toBe('tomorrow');
    expect(eventRsvpPromptWhen('2026-10-31T07:00:00Z', thursdayMorning)).toBe('soon');
  });
});

describe('RSVP window', () => {
  const now = Date.parse('2026-10-29T07:00:00Z');

  it('is open from 24 hours before the start until the event ends', () => {
    expect(EVENT_RSVP_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(
      isEventInRsvpWindow(
        { effective_starts_at: '2026-10-30T07:00:00Z', effective_ends_at: '2026-10-30T21:00:00Z' },
        now,
      ),
    ).toBe(true);
    expect(
      isEventInRsvpWindow(
        { effective_starts_at: '2026-10-31T07:00:00Z', effective_ends_at: '2026-10-31T21:00:00Z' },
        now,
      ),
    ).toBe(false);
    expect(
      isEventInRsvpWindow(
        { effective_starts_at: '2026-10-28T07:00:00Z', effective_ends_at: '2026-10-28T21:00:00Z' },
        now,
      ),
    ).toBe(false);
  });
});

describe('eventRsvpListSummary', () => {
  it('counts going / not going and lists the names that are coming', () => {
    expect(
      eventRsvpListSummary([
        { status: 'GOING', full_name: 'דנה' },
        { status: 'NOT_GOING', full_name: 'נועה' },
        { status: 'GOING', full_name: 'יעל' },
      ]),
    ).toEqual({ going: 2, notGoing: 1, goingNames: 'דנה, יעל' });
  });

  it('shortens a long going list', () => {
    const rows = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'].map((full_name) => ({ status: 'GOING' as const, full_name }));
    expect(eventRsvpListSummary(rows).goingNames).toBe('א, ב, ג, ד, ה ועוד 1');
  });
});

describe('eventRsvpSchema', () => {
  it('accepts going / not going and rejects anything else', () => {
    expect(eventRsvpSchema.safeParse({ eventId: '11111111-1111-4111-8111-111111111111', status: 'GOING' }).success).toBe(
      true,
    );
    expect(eventRsvpSchema.safeParse({ eventId: '11111111-1111-4111-8111-111111111111', status: 'NOT_GOING' }).success).toBe(
      true,
    );
    expect(eventRsvpSchema.safeParse({ eventId: '11111111-1111-4111-8111-111111111111', status: 'MAYBE' }).success).toBe(
      false,
    );
  });
});
