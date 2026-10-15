import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  matchPlan,
  normalizeTitle,
  parseAnnualEvents,
  planAnnualEvents,
  summarizePlan,
  toInsertRow,
  type ExistingEventRef,
} from '@/lib/domain/event-import';
import { eventImportSchema } from '@/lib/validation/schemas';

const root = path.join(__dirname, '..', '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'data', 'padelliel_annual_events_2026_2027.json'), 'utf8'));

const parsedOk = () => {
  const parsed = parseAnnualEvents(source);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.events;
};
const withEvent = (patch: Record<string, unknown>, index = 0) => ({
  ...source,
  events: source.events.map((e: object, i: number) => (i === index ? { ...e, ...patch } : e)),
});
const errors = (raw: unknown) => {
  const r = parseAnnualEvents(raw);
  return r.ok ? [] : r.errors;
};

describe('annual events source file', () => {
  it('is valid and has the 12 flyer events, all drafts, with no times and no images', () => {
    const events = parsedOk();
    expect(events).toHaveLength(12);
    expect(events.every((e) => e.status === 'DRAFT' && e.start_time === null && e.end_time === null && e.cover_image === null)).toBe(true);
    expect(new Set(events.map((e) => e.import_key)).size).toBe(12);
  });

  it('has exactly one multi-day event (October 11-15, 2026); the other 11 are single-day', () => {
    const multi = source.events.filter((e: { date_end: string; date_start: string }) => e.date_end !== e.date_start);
    expect(multi).toHaveLength(1);
    expect(multi[0]).toMatchObject({ date_start: '2026-10-11', date_end: '2026-10-15' });
  });

  it('pins the weekday of every date: Wednesdays, except Tue 2027-08-31 and Thu 2027-09-30 (as on the flyer)', () => {
    const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    const bySingleDay = new Map<string, number>(
      source.events.slice(1).map((e: { import_key: string; date_start: string }) => [e.import_key, weekday(e.date_start)]),
    );
    expect(bySingleDay.get('2027-08-bring-your-bestie')).toBe(2); // Tuesday
    expect(bySingleDay.get('2027-09-community-cup')).toBe(4); // Thursday
    const wednesdays = [...bySingleDay.entries()].filter(([, d]) => d === 3);
    expect(wednesdays).toHaveLength(9);
    // the two exceptions are the only non-Wednesdays, so nobody "fixed" them to a Wednesday date
    expect([...bySingleDay.entries()].filter(([, d]) => d !== 3).map(([k]) => k).sort()).toEqual([
      '2027-08-bring-your-bestie',
      '2027-09-community-cup',
    ]);
    expect(source.events[10].date_start).toBe('2027-08-31');
    expect(source.events[11].date_start).toBe('2027-09-30');
  });

  it('refuses a file that would publish, invent a time, or invent an image', () => {
    expect(errors(withEvent({ status: 'PUBLISHED' })).join()).toMatch(/status must be DRAFT/);
    expect(errors(withEvent({ start_time: '08:00' })).join()).toMatch(/start_time must be null/);
    expect(errors(withEvent({ end_time: '09:00' })).join()).toMatch(/end_time must be null/);
    expect(errors(withEvent({ cover_image: 'x.jpg' })).join()).toMatch(/cover_image must be null/);
  });

  it('refuses bad dates, keys, duplicate keys, wrong time zone and empty files', () => {
    expect(errors(withEvent({ date_start: '2026-02-30' })).length).toBeGreaterThan(0);
    expect(errors(withEvent({ date_end: '2026-10-10' })).join()).toMatch(/date_end/);
    expect(errors(withEvent({ import_key: 'Bad Key' })).length).toBeGreaterThan(0);
    expect(errors(withEvent({ import_key: source.events[1].import_key })).join()).toMatch(/import_key כפול/);
    expect(errors({ ...source, timezone: 'UTC' }).length).toBeGreaterThan(0);
    expect(errors({ ...source, events: [] }).length).toBeGreaterThan(0);
    expect(errors(withEvent({ description: '   ' })).length).toBeGreaterThan(0);
    expect(errors(withEvent({ location: '' })).length).toBeGreaterThan(0);
  });
});

describe('planning', () => {
  it('copies text and dates verbatim, in order; single-day events have no end date', () => {
    const plan = planAnnualEvents(parsedOk());
    expect(plan).toHaveLength(12);
    plan.forEach((p, i) => {
      const src = source.events[i];
      expect(p).toMatchObject({
        importKey: src.import_key,
        title: src.title,
        description: src.description,
        location: src.location,
        dateStart: src.date_start,
        status: 'DRAFT',
      });
      expect(p.dateEnd).toBe(src.date_end === src.date_start ? null : src.date_end);
    });
    expect(plan[0]).toMatchObject({ span: 'MULTI_DAY', dateStart: '2026-10-11', dateEnd: '2026-10-15' });
    expect(plan.slice(1).every((p) => p.span === 'SINGLE_DAY')).toBe(true);
  });

  it('the insert row has exactly the draft columns: no time, no image, no id, no creator', () => {
    for (const p of planAnnualEvents(parsedOk())) {
      const row = toInsertRow(p);
      expect(Object.keys(row).sort()).toEqual(['date_end', 'date_start', 'description', 'import_key', 'location', 'status', 'title']);
      expect(row.status).toBe('DRAFT');
    }
  });
});

describe('matching existing events', () => {
  const plan = planAnnualEvents(parsedOk());
  const ref = (patch: Partial<ExistingEventRef>): ExistingEventRef => ({
    id: 'e1',
    import_key: null,
    title: 'משהו אחר',
    status: 'DRAFT',
    starts_at: null,
    date_start: null,
    ...patch,
  });

  it('creates everything when nothing exists', () => {
    const rows = matchPlan(plan, []);
    expect(rows.every((r) => r.action === 'CREATE' && r.match === null)).toBe(true);
    expect(summarizePlan(rows)).toEqual({ total: 12, create: 12, skipSameKey: 0, skipSimilar: 0, singleDay: 11, multiDay: 1 });
  });

  it('skips an event that already has the import key, whatever staff changed since', () => {
    const rows = matchPlan(plan, [ref({ id: 'k', import_key: '2026-11-padel-yoga', title: 'שם חדש לגמרי', status: 'PUBLISHED', starts_at: '2030-01-01T10:00:00Z' })]);
    expect(rows.find((r) => r.event.importKey === '2026-11-padel-yoga')).toMatchObject({ action: 'SKIP_SAME_KEY', match: { id: 'k' } });
    expect(summarizePlan(rows)).toMatchObject({ create: 11, skipSameKey: 1 });
  });

  it('skips an event with the same title on the same date (a timed event is compared by its Israel date)', () => {
    const rows = matchPlan(plan, [
      ref({ id: 'a', title: ' PADEL  &  yoga ', starts_at: '2026-11-25T05:00:00Z' }), // 07:00 Israel on 2026-11-25
      ref({ id: 'b', title: 'Padel & Party', date_start: '2027-03-24' }),
    ]);
    expect(rows.find((r) => r.event.importKey === '2026-11-padel-yoga')).toMatchObject({ action: 'SKIP_SIMILAR', match: { id: 'a' } });
    expect(rows.find((r) => r.event.importKey === '2027-03-padel-party')).toMatchObject({ action: 'SKIP_SIMILAR', match: { id: 'b' } });
    expect(summarizePlan(rows)).toMatchObject({ create: 10, skipSimilar: 2 });
  });

  it('uses the Israel date, not the UTC date, for a late-evening timed event', () => {
    // 22:30Z on 2026-11-24 is 00:30 on 2026-11-25 in Israel
    const rows = matchPlan(plan, [ref({ title: 'Padel & Yoga', starts_at: '2026-11-24T22:30:00Z' })]);
    expect(rows.find((r) => r.event.importKey === '2026-11-padel-yoga')!.action).toBe('SKIP_SIMILAR');
  });

  it('does not treat the same title on another date as a duplicate', () => {
    const rows = matchPlan(plan, [ref({ title: 'Padel & Yoga', date_start: '2026-11-26' }), ref({ id: 'z', title: 'Padel & Yoga', starts_at: '2026-12-25T05:00:00Z' })]);
    expect(rows.every((r) => r.action === 'CREATE')).toBe(true);
  });

  it('normalises titles by trimming, collapsing spaces and ignoring case', () => {
    expect(normalizeTitle('  Padel   &  Yoga ')).toBe('padel & yoga');
  });
});

describe('confirmation', () => {
  it('only the exact phrase is accepted', () => {
    expect(eventImportSchema.safeParse({ confirm: 'ייבוא' }).success).toBe(true);
    for (const bad of [{}, { confirm: '' }, { confirm: 'import' }, { confirm: true }, { confirm: 'ייבוא ' }]) {
      expect(eventImportSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('import safety (source guards)', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');
  const service = read('src', 'server', 'services', 'event-import.ts');

  it('the service only ever inserts: it never updates, upserts or deletes events, and uses no privileged key', () => {
    expect(service).toContain('.insert(');
    expect(service).not.toMatch(/\.(update|upsert|delete)\(/);
    expect(service).not.toMatch(/service_role|SERVICE_ROLE|createClient\(.*key/i);
    expect(service).not.toMatch(/PUBLISHED/); // it never sets (or even names) the published status
  });

  it('the write action is admin-only, switch-gated, confirmation-gated, and revalidates the plan itself', () => {
    const actions = read('src', 'app', 'admin', 'events', 'actions.ts');
    const body = actions.slice(actions.indexOf('export async function importAnnualEventsAction'), actions.indexOf('export async function setEventStatusAction'));
    expect(body).toContain("actionContext('admin')");
    expect(body).toContain('eventImportSchema');
    expect(body).toContain('isEventImportEnabled()');
    expect(body.indexOf("actionContext('admin')")).toBeLessThan(body.indexOf('applyAnnualImport'));
    expect(body.indexOf('isEventImportEnabled()')).toBeLessThan(body.indexOf('applyAnnualImport'));
  });

  it('the dry-run page is admin-only and read-only (it imports no write service)', () => {
    const page = read('src', 'app', 'admin', 'events', 'import', 'page.tsx');
    expect(page).toContain('requireAdmin()');
    expect(page).toContain('previewAnnualImport');
    expect(page).not.toMatch(/applyAnnualImport|importAnnualEventsAction/);
  });

  it('the offline CLI dry run has no database client and reads no secrets', () => {
    const script = read('scripts', 'import-events-dry-run.ts');
    expect(script).not.toMatch(/supabase|process\.env|service_role/i);
  });

  it('no registration, RSVP, payment, participant or notification code was added by the import', () => {
    const files = [
      read('src', 'lib', 'domain', 'event-import.ts'),
      service,
      read('src', 'components', 'admin', 'event-import.tsx'),
      read('src', 'app', 'admin', 'events', 'import', 'page.tsx'),
    ].join('\n');
    expect(files).not.toMatch(/rsvp|payment|participant|notification|registration|checkout|booking/i);
  });

  it('only the explicit write switch enables the import, and it is not a public variable', () => {
    const env = read('src', 'lib', 'env.ts');
    expect(env).toContain("process.env.ALLOW_EVENT_IMPORT?.trim() === '1'");
    expect(env).not.toContain('NEXT_PUBLIC_ALLOW_EVENT_IMPORT');
  });
});
