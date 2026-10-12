import { describe, expect, it } from 'vitest';
import {
  EVENT_IMAGE_MAX_BYTES,
  checkEventImage,
  isEventPast,
  sniffImageType,
  splitParagraphs,
} from '@/lib/domain/events';
import {
  formatEventDateHe,
  formatEventTimeHe,
  formatEventWhenHe,
  instantToIsraelLocal,
  israelLocalToInstant,
} from '@/lib/time';
import { eventFormSchema, eventSaveSchema } from '@/lib/validation/schemas';

describe('Israel local time <-> instant', () => {
  it('converts winter time (UTC+2) and summer time (UTC+3) correctly', () => {
    expect(israelLocalToInstant('2026-11-02T18:30')?.toISOString()).toBe('2026-11-02T16:30:00.000Z');
    expect(israelLocalToInstant('2026-07-10T18:30')?.toISOString()).toBe('2026-07-10T15:30:00.000Z');
  });

  it('handles the days daylight saving time changes', () => {
    // Summer time ends on Sunday 2026-10-25 at 02:00 -> 01:00; the day is 25h long.
    expect(israelLocalToInstant('2026-10-25T00:30')?.toISOString()).toBe('2026-10-24T21:30:00.000Z'); // still UTC+3
    expect(israelLocalToInstant('2026-10-25T12:00')?.toISOString()).toBe('2026-10-25T10:00:00.000Z'); // UTC+2
    // Summer time starts on Friday 2026-03-27 at 02:00 -> 03:00.
    expect(israelLocalToInstant('2026-03-27T12:00')?.toISOString()).toBe('2026-03-27T09:00:00.000Z'); // UTC+3
    expect(israelLocalToInstant('2026-03-26T12:00')?.toISOString()).toBe('2026-03-26T10:00:00.000Z'); // UTC+2
  });

  it('rejects wall-clock times that do not exist, and malformed or impossible input', () => {
    expect(israelLocalToInstant('2026-03-27T02:30')).toBeNull(); // skipped hour
    for (const bad of ['', 'x', '2026-11-02', '2026-11-02 18:30', '2026-11-02T18:30:00', '2026-02-30T10:00', '2026-13-01T10:00', '2026-11-02T24:00', '2026-11-02T18:60']) {
      expect(israelLocalToInstant(bad), bad).toBeNull();
    }
  });

  it('accepts either occurrence of the repeated hour when the clock goes back', () => {
    const repeated = israelLocalToInstant('2026-10-25T01:30');
    expect(repeated).not.toBeNull();
    expect(instantToIsraelLocal(repeated!.toISOString())).toBe('2026-10-25T01:30');
  });

  it('round-trips through the form representation', () => {
    for (const local of ['2026-11-02T18:30', '2026-07-10T07:05', '2027-01-01T00:00', '2026-12-31T23:59']) {
      expect(instantToIsraelLocal(israelLocalToInstant(local)!.toISOString())).toBe(local);
    }
  });
});

describe('event date formatting (Hebrew, Asia/Jerusalem)', () => {
  const start = '2026-11-02T16:30:00Z'; // Monday 18:30 in Israel

  it('formats the date and the time in Israel time', () => {
    expect(formatEventDateHe(start)).toBe('יום שני, 2 בנובמבר 2026');
    expect(formatEventTimeHe(start)).toBe('18:30');
  });

  it('uses the Israel date, not the UTC date, around midnight', () => {
    // 22:30Z on Nov 2 is already 00:30 on Nov 3 in Israel
    expect(formatEventDateHe('2026-11-02T22:30:00Z')).toBe('יום שלישי, 3 בנובמבר 2026');
    expect(formatEventTimeHe('2026-11-02T22:30:00Z')).toBe('00:30');
  });

  it('describes a single-day event with and without an end time', () => {
    expect(formatEventWhenHe(start, '2026-11-02T18:00:00Z')).toEqual({ date: 'יום שני, 2 בנובמבר 2026', time: '18:30–20:00' });
    expect(formatEventWhenHe(start, null)).toEqual({ date: 'יום שני, 2 בנובמבר 2026', time: '18:30' });
    expect(formatEventWhenHe(start, null, true)).toEqual({ date: 'יום שני, 2 בנובמבר', time: '18:30' });
  });

  it('describes an event that spans days', () => {
    expect(formatEventWhenHe(start, '2026-11-03T10:00:00Z')).toEqual({ date: '2 בנובמבר, 18:30 – 3 בנובמבר, 12:00', time: null });
  });
});

describe('event form validation', () => {
  const valid = {
    title: 'בוקר פאדל וקפה',
    description: 'פרטים על האירוע',
    startsAt: '2026-11-02T18:30',
    endsAt: '2026-11-02T20:00',
    location: 'מרכז הטניס כוכב יאיר',
    status: 'PUBLISHED' as const,
  };
  const message = (input: unknown, schema: typeof eventFormSchema = eventFormSchema) => {
    const r = schema.safeParse(input);
    return r.success ? null : r.error.issues[0].message;
  };

  it('accepts a complete event, and an event without an end time', () => {
    expect(eventFormSchema.safeParse(valid).success).toBe(true);
    const noEnd = eventFormSchema.safeParse({ ...valid, endsAt: '' });
    expect(noEnd.success).toBe(true);
    expect(noEnd.success && noEnd.data.endsAt).toBeUndefined();
  });

  it('rejects an end that is not after the start', () => {
    expect(message({ ...valid, endsAt: '2026-11-02T18:30' })).toBe('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
    expect(message({ ...valid, endsAt: '2026-11-02T09:00' })).toBe('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
    expect(message({ ...valid, endsAt: '2026-11-01T20:00' })).toBe('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
  });

  it('rejects invalid dates and times', () => {
    expect(message({ ...valid, startsAt: '' })).toBe('תאריך או שעה לא תקינים');
    expect(message({ ...valid, startsAt: '2026-02-30T10:00' })).toBe('תאריך או שעה לא תקינים');
    expect(message({ ...valid, startsAt: 'tomorrow' })).toBe('תאריך או שעה לא תקינים');
    expect(message({ ...valid, endsAt: '2026-11-31T10:00' })).toBe('תאריך או שעה לא תקינים');
  });

  it('treats the end as Israel time when ordering (DST day)', () => {
    // 00:30 -> 02:30 on the day the clock goes back is a valid, three-hour-long event
    expect(eventFormSchema.safeParse({ ...valid, startsAt: '2026-10-25T00:30', endsAt: '2026-10-25T02:30' }).success).toBe(true);
  });

  it('needs a title and a location, and limits their length', () => {
    expect(message({ ...valid, title: ' ' })).toBe('יש להזין כותרת');
    expect(message({ ...valid, title: 'א'.repeat(121) })).toBe('הכותרת ארוכה מדי');
    expect(message({ ...valid, location: '  ' })).toBe('יש להזין מיקום');
    expect(message({ ...valid, description: 'א'.repeat(5001) })).toBe('התיאור ארוך מדי');
  });

  it('requires a description only to publish, not to save a draft', () => {
    expect(message({ ...valid, description: '  ' })).toBe('כדי לפרסם אירוע יש להוסיף תיאור');
    expect(eventFormSchema.safeParse({ ...valid, description: '', status: 'DRAFT' }).success).toBe(true);
  });

  it('only allows the DRAFT and PUBLISHED statuses', () => {
    expect(eventFormSchema.safeParse({ ...valid, status: 'CANCELLED' }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...valid, status: undefined }).success).toBe(false);
  });

  it('the save schema validates the id and carries the same rules', () => {
    expect(eventSaveSchema.safeParse({ ...valid, id: '3f2b8a52-1f4e-4d0b-9a55-1d1b2c0d9e11' }).success).toBe(true);
    expect(eventSaveSchema.safeParse({ ...valid, id: 'not-a-uuid' }).success).toBe(false);
    expect(message({ ...valid, endsAt: '2026-11-02T10:00' }, eventSaveSchema as unknown as typeof eventFormSchema)).toBe('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
    const ok = eventSaveSchema.safeParse(valid);
    expect(ok.success && ok.data.removeImage).toBe(false);
  });
});

describe('event images', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const webp = Uint8Array.from([...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBP')]);

  it('recognises jpeg, png and webp by content', () => {
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(webp)).toBe('image/webp');
  });

  it('rejects everything else, whatever the file name or MIME type claims', () => {
    expect(sniffImageType(Buffer.from('GIF89a......'))).toBeNull();
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffImageType(Buffer.from('RIFF....WAVE'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });

  it('enforces the size limit and rejects empty files', () => {
    expect(checkEventImage(1024, jpeg)).toEqual({ ok: true, type: 'image/jpeg' });
    expect(checkEventImage(EVENT_IMAGE_MAX_BYTES, png)).toEqual({ ok: true, type: 'image/png' });
    expect(checkEventImage(EVENT_IMAGE_MAX_BYTES + 1, png).ok).toBe(false);
    expect(checkEventImage(0, jpeg).ok).toBe(false);
    expect(checkEventImage(100, Buffer.from('not an image')).ok).toBe(false);
  });
});

describe('event text and status helpers', () => {
  it('splits a description into paragraphs on blank lines and keeps single line breaks', () => {
    expect(splitParagraphs('שורה א\nשורה ב\n\nפסקה שנייה\r\n\r\n\r\n  פסקה שלישית  ')).toEqual([
      'שורה א\nשורה ב',
      'פסקה שנייה',
      'פסקה שלישית',
    ]);
    expect(splitParagraphs('  \n\n ')).toEqual([]);
  });

  it('knows when an event is over', () => {
    const now = new Date('2026-11-02T12:00:00Z').getTime();
    expect(isEventPast({ effective_ends_at: '2026-11-02T11:59:59Z' }, now)).toBe(true);
    expect(isEventPast({ effective_ends_at: '2026-11-02T12:00:00Z' }, now)).toBe(true);
    expect(isEventPast({ effective_ends_at: '2026-11-02T12:00:01Z' }, now)).toBe(false);
  });
});
