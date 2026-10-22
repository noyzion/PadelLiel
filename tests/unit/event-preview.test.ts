import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EventDetails } from '@/components/events/event-details';
import { PREVIEW_EVENT_ID, buildPreviewEvent, type EventPreviewInput } from '@/lib/domain/event-preview';
import { isEventPast, type EventView } from '@/lib/domain/events';
import { israelEndOfDay } from '@/lib/time';

const input: EventPreviewInput = {
  title: '  בוקר פאדל וקפה  ',
  description: 'פסקה ראשונה\n\nפסקה שנייה',
  startsAt: '2026-11-02T18:30',
  endsAt: '2026-11-02T20:00',
  location: 'מרכז הטניס כוכב יאיר',
};

describe('buildPreviewEvent (unsaved form values -> the event trainees would see)', () => {
  it('builds the event from the typed values, converting Israel time to instants', () => {
    const r = buildPreviewEvent(input, 'DRAFT', 'blob:local-image');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event).toMatchObject({
      id: PREVIEW_EVENT_ID,
      title: 'בוקר פאדל וקפה', // trimmed exactly like a real save
      description: 'פסקה ראשונה\n\nפסקה שנייה',
      location: 'מרכז הטניס כוכב יאיר',
      status: 'DRAFT',
      image_url: 'blob:local-image',
      cover_image: null,
      starts_at: '2026-11-02T16:30:00.000Z',
      ends_at: '2026-11-02T18:00:00.000Z',
      effective_ends_at: '2026-11-02T18:00:00.000Z',
    });
  });

  it('follows the database rule for events without an end time: they end with their Israel day', () => {
    const r = buildPreviewEvent({ ...input, endsAt: '' }, 'DRAFT', null);
    expect(r.ok && r.event.ends_at).toBeNull();
    expect(r.ok && r.event.image_url).toBeNull();
    // Monday 2026-11-02 18:30 Israel (UTC+2) -> ends at the next local midnight = 22:00Z
    expect(r.ok && r.event.effective_ends_at).toBe('2026-11-02T22:00:00.000Z');
  });

  it('computes the end of day across the daylight saving change', () => {
    // 2026-10-25 is the 25-hour day: 01:00 Israel is still UTC+3, the next midnight is UTC+2
    expect(israelEndOfDay('2026-10-24T22:00:00Z').toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });

  it('uses the same validation as saving, so an impossible event cannot be previewed', () => {
    const message = (patch: Partial<EventPreviewInput>, status: 'DRAFT' | 'PUBLISHED' = 'DRAFT') => {
      const r = buildPreviewEvent({ ...input, ...patch }, status, null);
      return r.ok ? null : r.message;
    };
    expect(message({ endsAt: '2026-11-02T18:30' })).toBe('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
    expect(message({ endsAt: '2026-11-02T09:00' })).toBe('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
    expect(message({ startsAt: '2026-02-30T10:00' })).toBe('תאריך או שעה לא תקינים');
    expect(message({ startsAt: '' }, 'PUBLISHED')).toBe('כדי לפרסם אירוע יש להוסיף תאריך');
    expect(message({ title: ' ' })).toBe('יש להזין כותרת');
    expect(message({ location: '' })).toBe('יש להזין מיקום');
  });

  it('lets a draft without a description be previewed, but not a published event', () => {
    expect(buildPreviewEvent({ ...input, description: '' }, 'DRAFT', null).ok).toBe(true);
    expect(buildPreviewEvent({ ...input, description: '' }, 'PUBLISHED', null)).toEqual({
      ok: false,
      message: 'כדי לפרסם אירוע יש להוסיף תיאור',
    });
  });

  it('is pure: it does not modify its input', () => {
    const copy = structuredClone(input);
    buildPreviewEvent(input, 'PUBLISHED', null);
    expect(input).toEqual(copy);
  });
});

describe('EventDetails (shared by the trainee page and the admin previews)', () => {
  const event = (patch: Partial<EventView> = {}): EventView => {
    const built = buildPreviewEvent(input, 'DRAFT', null);
    if (!built.ok) throw new Error(built.message);
    return { ...built.event, ...patch };
  };
  const html = (e: EventView, past = false) => renderToStaticMarkup(createElement(EventDetails, { event: e, past }));

  it('shows the title, date, hours, location and every paragraph of the description', () => {
    const out = html(event());
    expect(out).toContain('<h1');
    expect(out).toContain('בוקר פאדל וקפה');
    expect(out).toContain('יום שני, 2 בנובמבר 2026');
    expect(out).toContain('18:30-20:00');
    expect(out).toContain('מרכז הטניס כוכב יאיר');
    expect(out).toContain('פסקה ראשונה');
    expect(out).toContain('פסקה שנייה');
    expect(out).toContain('שעות');
  });

  it('shows only the start time for an event without an end time', () => {
    const out = html(event({ ends_at: null }));
    expect(out).toContain('שעת התחלה');
    expect(out).toContain('18:30');
    expect(out).not.toContain('18:30-20:00');
  });

  it('shows the cover image when there is one, and nothing when there is not', () => {
    expect(html(event({ image_url: null }))).not.toContain('<img');
    expect(html(event({ image_url: 'blob:local-image' }))).toContain('<img');
  });

  it('marks past events', () => {
    expect(html(event(), true)).toContain('אירוע שהסתיים');
    expect(html(event(), false)).not.toContain('אירוע שהסתיים');
    expect(isEventPast(event(), new Date('2026-11-03T00:00:00Z').getTime())).toBe(true);
  });

  it('escapes user text instead of rendering it as markup', () => {
    const out = html(event({ title: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' }));
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('previewing a date-only draft (admins can preview drafts that have no time yet)', () => {
  const dateOnly: EventPreviewInput = { ...input, startsAt: '2026-10-11', endsAt: '2026-10-15' };

  it('builds a draft with the date range, no times, and the end of the last day as its end', () => {
    const r = buildPreviewEvent(dateOnly, 'DRAFT', null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event).toMatchObject({
      status: 'DRAFT',
      starts_at: null,
      ends_at: null,
      date_start: '2026-10-11',
      date_end: '2026-10-15',
      // 2026-10-16 00:00 Israel (UTC+3)
      effective_ends_at: '2026-10-15T21:00:00.000Z',
    });
  });

  it('can be previewed as a published event: a time is not needed to publish', () => {
    const r = buildPreviewEvent(dateOnly, 'PUBLISHED', null);
    expect(r.ok).toBe(true);
    expect(r.ok && r.event).toMatchObject({
      status: 'PUBLISHED',
      starts_at: null,
      ends_at: null,
      date_start: '2026-10-11',
      date_end: '2026-10-15',
      effective_starts_at: '2026-10-10T21:00:00.000Z', // 2026-10-11 00:00 Israel (UTC+3)
      effective_ends_at: '2026-10-15T21:00:00.000Z',
    });
    // a published date-only event still needs its description
    expect(buildPreviewEvent({ ...dateOnly, description: '' }, 'PUBLISHED', null)).toEqual({
      ok: false,
      message: 'כדי לפרסם אירוע יש להוסיף תיאור',
    });
  });

  it('renders the date range and "the time will be announced", never an invented time', () => {
    for (const status of ['DRAFT', 'PUBLISHED'] as const) {
      const r = buildPreviewEvent(dateOnly, status, null);
      if (!r.ok) throw new Error(r.message);
      const out = renderToStaticMarkup(createElement(EventDetails, { event: r.event, past: false }));
      expect(out).toContain('11-15 באוקטובר 2026');
      expect(out).toContain('השעה תפורסם בהמשך');
      expect(out).not.toContain('שעת התחלה');
      expect(out).not.toContain('שעות');
      expect(out).not.toMatch(/\d{1,2}:\d{2}/);
      expect(out).toContain('בוקר פאדל וקפה');
    }
  });

  it('a timed event never shows the "time will be announced" text', () => {
    const r = buildPreviewEvent(input, 'PUBLISHED', null);
    if (!r.ok) throw new Error(r.message);
    const out = renderToStaticMarkup(createElement(EventDetails, { event: r.event, past: false }));
    expect(out).not.toContain('השעה תפורסם בהמשך');
    expect(out).toContain('18:30-20:00');
  });

  it('a draft with no date at all can be previewed as a draft, and cannot be published', () => {
    const undated: EventPreviewInput = { ...input, startsAt: '', endsAt: '' };
    const r = buildPreviewEvent(undated, 'DRAFT', null);
    expect(r.ok).toBe(true);
    expect(r.ok && r.event).toMatchObject({ status: 'DRAFT', starts_at: null, ends_at: null, date_start: null, date_end: null });
    expect(buildPreviewEvent(undated, 'PUBLISHED', null)).toEqual({ ok: false, message: 'כדי לפרסם אירוע יש להוסיף תאריך' });
    if (r.ok) {
      const out = renderToStaticMarkup(createElement(EventDetails, { event: r.event, past: false }));
      expect(out).toContain('טרם נקבע תאריך');
    }
  });

  it('a timed preview is unchanged', () => {
    const r = buildPreviewEvent(input, 'DRAFT', null);
    expect(r.ok && r.event).toMatchObject({ date_start: null, date_end: null, starts_at: '2026-11-02T16:30:00.000Z' });
  });
});

describe('preview wiring and access control (source guards)', () => {
  const root = path.join(__dirname, '..', '..', 'src');
  const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

  it('the trainee page and both admin previews render the very same component', () => {
    for (const file of [
      ['app', '(member)', 'events', '[id]', 'page.tsx'],
      ['app', 'admin', 'events', '[id]', 'preview', 'page.tsx'],
      ['components', 'admin', 'event-form.tsx'],
    ]) {
      expect(read(...file), file.join('/')).toContain("from '@/components/events/event-details'");
    }
  });

  it('the saved-event preview is admin-only, read-only, and checks the admin before touching data', () => {
    const page = read('app', 'admin', 'events', '[id]', 'preview', 'page.tsx');
    expect(page).toContain('requireAdmin()');
    expect(page.indexOf('requireAdmin()')).toBeLessThan(page.indexOf('getEvent('));
    // no write service is imported by the page (publishing goes through the admin-guarded server action)
    expect(page).not.toMatch(/createEvent|updateEvent|setEventStatus\(|deleteEvent/);
  });

  it('EventDetails stays free of personal RSVP actions, so the admin preview cannot drift', () => {
    expect(read('components', 'events', 'event-details.tsx')).not.toMatch(/rsvp|setEventRsvp/i);
    expect(read('app', '(member)', 'events', '[id]', 'page.tsx')).toContain('EventRsvp');
  });

  it('the trainee page only ever reads published events and never uses the admin read', () => {
    const page = read('app', '(member)', 'events', '[id]', 'page.tsx');
    expect(page).toContain('requireMember()');
    expect(page).toContain('getPublishedEvent(');
    expect(page).not.toMatch(/\bgetEvent\(/);
    expect(page).not.toContain('/preview');
    expect(page).not.toContain('requireAdmin');
  });

  it('the form preview is built in the browser from the form and sends nothing to the server', () => {
    const form = read('components', 'admin', 'event-form.tsx');
    const openPreview = form.slice(form.indexOf('function openPreview()'), form.indexOf('function closePreview()'));
    expect(openPreview).toContain('buildPreviewEvent(');
    expect(openPreview).not.toMatch(/saveEventAction|setEventStatusAction|run\(|fetch\(/);
  });
});
