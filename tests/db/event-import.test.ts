import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  matchPlan,
  parseAnnualEvents,
  planAnnualEvents,
  toInsertRow,
  type ExistingEventRef,
  type PlannedEvent,
} from '@/lib/domain/event-import';
import { TestDb, type UserSession } from './support/harness';

// Date-only drafts and the annual-calendar import, against the real migrations, RLS and column grants.
let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});

const SOURCE_PATH = path.join(__dirname, '..', '..', 'data', 'padelliel_annual_events_2026_2027.json');
const rawSource = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8')) as { events: Record<string, string | null>[] };

function planned(): PlannedEvent[] {
  const parsed = parseAnnualEvents(rawSource);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return planAnnualEvents(parsed.events);
}

interface Row {
  id: string;
  import_key: string | null;
  title: string;
  description: string;
  location: string;
  status: string;
  starts_at: Date | null;
  ends_at: Date | null;
  date_start: string | null;
  date_end: string | null;
  cover_image: string | null;
  created_by: string | null;
  effective_ends_at: Date | null;
}

const allRows = async () => (await db.sql<Row>('select * from public.community_events order by import_key nulls first, id')).rows;

/**
 * Exactly what src/server/services/event-import.ts does: read the existing events as the admin, plan with matchPlan,
 * and INSERT only the missing drafts (toInsertRow). Returns how many rows it created.
 */
async function runImport(admin: UserSession): Promise<number> {
  const existing = (
    await admin.query<ExistingEventRef>('select id, import_key, title, status, starts_at, date_start from public.community_events order by id')
  ).rows.map((r) => ({ ...r, starts_at: r.starts_at ? new Date(r.starts_at as unknown as string).toISOString() : null }));
  let created = 0;
  for (const row of matchPlan(planned(), existing)) {
    if (row.action !== 'CREATE') continue;
    const r = toInsertRow(row.event);
    try {
      await admin.query(
        `insert into public.community_events (import_key, title, description, location, status, date_start, date_end)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [r.import_key, r.title, r.description, r.location, r.status, r.date_start, r.date_end],
      );
      created += 1;
    } catch (err) {
      if ((err as { code?: string }).code !== '23505') throw err; // same as the service: a concurrent duplicate is skipped
    }
  }
  return created;
}

async function cleanSlate() {
  await db.sql('delete from public.community_events');
}

describe('date-only drafts', () => {
  it('an admin can save a draft with only a date, and a date range, without any time', async () => {
    const admin = await db.createAdmin();
    const single = await admin.query<Row>(
      "insert into public.community_events (title, description, date_start) values ('פאדל ויוגה', 'פרטים', '2026-11-25') returning *",
    );
    expect(single.rows[0]).toMatchObject({ status: 'DRAFT', starts_at: null, ends_at: null, date_start: '2026-11-25', date_end: null });

    const range = await admin.query<Row>(
      "insert into public.community_events (title, date_start, date_end) values ('אירוע פתיחה', '2026-10-11', '2026-10-15') returning *",
    );
    expect(range.rows[0]).toMatchObject({ starts_at: null, date_start: '2026-10-11', date_end: '2026-10-15' });
  });

  it('effective_ends_at of a date-only draft is the end of its last Israel day (DST-safe)', async () => {
    const admin = await db.createAdmin();
    const eff = async (cols: string, vals: string) =>
      (await admin.query<Row>(`insert into public.community_events (title, ${cols}) values ('בדיקה', ${vals}) returning effective_ends_at`)).rows[0].effective_ends_at!.toISOString();
    // 2026-10-15 is still summer time (UTC+3): the next local midnight is 21:00Z
    expect(await eff('date_start, date_end', "'2026-10-11', '2026-10-15'")).toBe('2026-10-15T21:00:00.000Z');
    // 2026-11-25 is winter time (UTC+2): 22:00Z
    expect(await eff('date_start', "'2026-11-25'")).toBe('2026-11-25T22:00:00.000Z');
    // across the clock change (2026-10-25): the last day decides
    expect(await eff('date_start, date_end', "'2026-10-24', '2026-10-25'")).toBe('2026-10-25T22:00:00.000Z');
  });

  it('timed events behave exactly as before (end of day without an end time, ends_at otherwise)', async () => {
    const admin = await db.createAdmin();
    const noEnd = await admin.query<Row>("insert into public.community_events (title, starts_at) values ('בדיקה', '2026-11-02T16:30:00Z') returning effective_ends_at");
    expect(noEnd.rows[0].effective_ends_at!.toISOString()).toBe('2026-11-02T22:00:00.000Z');
    const withEnd = await admin.query<Row>(
      "insert into public.community_events (title, starts_at, ends_at) values ('בדיקה', '2026-11-02T16:30:00Z', '2026-11-02T18:00:00Z') returning effective_ends_at",
    );
    expect(withEnd.rows[0].effective_ends_at!.toISOString()).toBe('2026-11-02T18:00:00.000Z');
  });

  it('an event has exactly one kind of "when"', async () => {
    const admin = await db.createAdmin();
    const bad = (cols: string, vals: string) =>
      expect(admin.query(`insert into public.community_events (title, ${cols}) values ('בדיקה', ${vals})`)).rejects.toMatchObject({
        constraint: 'community_events_when_exclusive',
      });
    await bad('starts_at, date_start', "'2026-11-02T16:30:00Z', '2026-11-02'"); // timed and dated
    await bad('starts_at, date_end', "'2026-11-02T16:30:00Z', '2026-11-03'");
    await bad('ends_at, date_start', "'2026-11-03T16:30:00Z', '2026-11-02'"); // an end time without a start time
    await bad('date_end', "'2026-11-03'"); // an end date without a start date
    await bad('status', "'DRAFT'"); // no "when" at all
  });

  it('a date range must run forward; a single day has no end date', async () => {
    const admin = await db.createAdmin();
    for (const end of ['2026-10-11', '2026-10-10']) {
      await expect(
        admin.query("insert into public.community_events (title, date_start, date_end) values ('בדיקה', '2026-10-11', $1)", [end]),
      ).rejects.toMatchObject({ constraint: 'community_events_date_range' });
    }
  });

  it('a date-only event cannot be published; publishing needs a real start time', async () => {
    const admin = await db.createAdmin();
    await expect(
      admin.query("insert into public.community_events (title, description, date_start, status) values ('בדיקה', 'פרטים', '2026-11-25', 'PUBLISHED')"),
    ).rejects.toMatchObject({ constraint: 'community_events_published_has_start' });

    const draft = (await admin.query<Row>("insert into public.community_events (title, description, date_start) values ('בדיקה', 'פרטים', '2026-11-25') returning id")).rows[0].id;
    await expect(admin.query("update public.community_events set status = 'PUBLISHED' where id = $1", [draft])).rejects.toMatchObject({
      constraint: 'community_events_published_has_start',
    });
    // Adding the time without removing the date is not a valid state either...
    await expect(
      admin.query("update public.community_events set starts_at = '2026-11-25T05:00:00Z', status = 'PUBLISHED' where id = $1", [draft]),
    ).rejects.toMatchObject({ constraint: 'community_events_when_exclusive' });
    // ...but converting it to a timed event (what the edit form does) lets it be published.
    await admin.query(
      "update public.community_events set starts_at = '2026-11-25T05:00:00Z', date_start = null, date_end = null, status = 'PUBLISHED' where id = $1",
      [draft],
    );
    expect((await db.sql<Row>('select status, starts_at, date_start from public.community_events where id = $1', [draft])).rows[0]).toMatchObject({
      status: 'PUBLISHED',
      date_start: null,
    });
  });

  it('the existing publish rules still apply: a published event needs a description', async () => {
    const admin = await db.createAdmin();
    await expect(
      admin.query("insert into public.community_events (title, description, starts_at, status) values ('בדיקה', ' ', '2026-11-02T16:30:00Z', 'PUBLISHED')"),
    ).rejects.toMatchObject({ constraint: 'community_events_published_has_description' });
  });

  it('trainees never see date-only drafts (RLS unchanged); admins do', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const pending = await db.createMember({ approved: false, limit: null });
    const id = (await admin.query<Row>("insert into public.community_events (title, date_start) values ('טיוטה ללא שעה', '2026-11-25') returning id")).rows[0].id;
    expect((await member.query('select 1 from public.community_events where id = $1', [id])).rowCount).toBe(0);
    expect((await pending.query('select 1 from public.community_events where id = $1', [id])).rowCount).toBe(0);
    expect((await admin.query('select 1 from public.community_events where id = $1', [id])).rowCount).toBe(1);
  });

  it('a trainee still cannot create a date-only event', async () => {
    const member = await db.createMember();
    await expect(member.query("insert into public.community_events (title, date_start) values ('פריצה', '2026-11-25')")).rejects.toThrow(/row-level security|permission denied/);
  });
});

describe('import key', () => {
  it('is unique, well-formed, and optional (manual events have none)', async () => {
    const admin = await db.createAdmin();
    const insert = (key: string | null) =>
      admin.query("insert into public.community_events (title, date_start, import_key) values ('בדיקה', '2026-11-25', $1)", [key]);
    await expect(insert('2026-11-test-key')).resolves.toBeTruthy();
    await expect(insert('2026-11-test-key')).rejects.toMatchObject({ code: '23505', constraint: 'community_events_import_key_key' });
    await expect(insert(null)).resolves.toBeTruthy();
    await expect(insert(null)).resolves.toBeTruthy(); // any number of manual events
    for (const bad of ['', 'ab', 'Has-Upper', 'has space', '-leading', 'x'.repeat(81)]) {
      await expect(insert(bad), bad).rejects.toMatchObject({ constraint: 'community_events_import_key_format' });
    }
  });

  it('is set when an event is created and can never be changed through the API', async () => {
    const admin = await db.createAdmin();
    const id = (
      await admin.query<Row>("insert into public.community_events (title, date_start, import_key) values ('בדיקה', '2026-11-25', 'fixed-key-1') returning id")
    ).rows[0].id;
    await expect(admin.query("update public.community_events set import_key = 'other-key-2' where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(admin.query('update public.community_events set import_key = null where id = $1', [id])).rejects.toThrow(/permission denied/);
    expect((await db.sql<Row>('select import_key from public.community_events where id = $1', [id])).rows[0].import_key).toBe('fixed-key-1');
  });

  it('a trainee cannot set it either', async () => {
    const member = await db.createMember();
    await expect(member.query("insert into public.community_events (title, date_start, import_key) values ('x y', '2026-11-25', 'sneaky-key')")).rejects.toThrow(
      /row-level security|permission denied/,
    );
  });
});

describe('annual events import (the real data file)', () => {
  it('the source file yields 12 events: one multi-day (Oct 11-15 2026) and eleven single-day', () => {
    const plan = planned();
    expect(plan).toHaveLength(12);
    const multi = plan.filter((p) => p.span === 'MULTI_DAY');
    expect(multi).toHaveLength(1);
    expect(multi[0]).toMatchObject({ importKey: '2026-10-padel-coffee', dateStart: '2026-10-11', dateEnd: '2026-10-15' });
    const single = plan.filter((p) => p.span === 'SINGLE_DAY');
    expect(single).toHaveLength(11);
    expect(single.every((p) => p.dateEnd === null)).toBe(true);
  });

  it('creates all 12 as date-only drafts that preserve title, description, location and dates exactly', async () => {
    await cleanSlate();
    const admin = await db.createAdmin();
    expect(await runImport(admin)).toBe(12);

    const rows = await allRows();
    expect(rows).toHaveLength(12);
    for (const src of rawSource.events) {
      const row = rows.find((r) => r.import_key === src.import_key)!;
      expect(row, src.import_key as string).toBeTruthy();
      expect(row.title).toBe(src.title);
      expect(row.description).toBe(src.description);
      expect(row.location).toBe(src.location);
      expect(row.date_start).toBe(src.date_start);
      // the one multi-day event keeps its range; single-day events store no end date
      expect(row.date_end).toBe(src.date_end === src.date_start ? null : src.date_end);
      // never published, never a made-up time or image
      expect(row.status).toBe('DRAFT');
      expect(row.starts_at).toBeNull();
      expect(row.ends_at).toBeNull();
      expect(row.cover_image).toBeNull();
      expect(row.created_by).toBe(admin.userId);
    }
    expect(rows.filter((r) => r.date_end !== null)).toHaveLength(1);
  });

  it('is idempotent: running it again creates nothing', async () => {
    await cleanSlate();
    const admin = await db.createAdmin();
    expect(await runImport(admin)).toBe(12);
    expect(await runImport(admin)).toBe(0);
    expect(await runImport(admin)).toBe(0);
    expect((await allRows()).length).toBe(12);
  });

  it('the unique key alone prevents duplicates, even if two imports race', async () => {
    await cleanSlate();
    const admin = await db.createAdmin();
    const [a, b] = await Promise.all([runImport(admin), runImport(admin)]);
    expect(a + b).toBe(12);
    expect((await allRows()).length).toBe(12);
  });

  it('never overwrites staff edits on a later run', async () => {
    await cleanSlate();
    const admin = await db.createAdmin();
    await runImport(admin);

    const yoga = (await allRows()).find((r) => r.import_key === '2026-11-padel-yoga')!;
    await admin.query(
      "update public.community_events set title = 'יוגה בבוקר', description = 'נוסח חדש של הצוות', location = 'המגרש הצפוני', starts_at = '2026-11-25T05:30:00Z', date_start = null, date_end = null where id = $1",
      [yoga.id],
    );
    const published = (await allRows()).find((r) => r.import_key === '2026-12-point-morning')!;
    await admin.query(
      "update public.community_events set starts_at = '2026-12-23T05:00:00Z', date_start = null, status = 'PUBLISHED' where id = $1",
      [published.id],
    );
    const before = await allRows();

    expect(await runImport(admin)).toBe(0);
    expect(await allRows()).toEqual(before);
    const after = (await allRows()).find((r) => r.import_key === '2026-11-padel-yoga')!;
    expect(after).toMatchObject({ title: 'יוגה בבוקר', description: 'נוסח חדש של הצוות', location: 'המגרש הצפוני' });
    expect((await allRows()).find((r) => r.import_key === '2026-12-point-morning')!.status).toBe('PUBLISHED'); // stays published
  });

  it('leaves every pre-existing event untouched, and skips an event that looks the same as a manual one', async () => {
    await cleanSlate();
    const admin = await db.createAdmin();
    // Existing, unrelated events (one published, one draft) and two events created by hand that match the flyer:
    const mk = async (title: string, startsAt: string | null, dateStart: string | null, status: 'DRAFT' | 'PUBLISHED', description: string) =>
      (
        await db.sql<{ id: string }>(
          `insert into public.community_events (id, title, description, starts_at, date_start, status) values ($1, $2, $3, $4, $5, $6) returning id`,
          [randomUUID(), title, description, startsAt, dateStart, status],
        )
      ).rows[0].id;
    const unrelated = await mk('ערב קהילה', '2026-12-01T16:00:00Z', null, 'PUBLISHED', 'אירוע קיים');
    const unrelatedDraft = await mk('טיוטה ישנה', null, '2027-02-02', 'DRAFT', '');
    const manualYoga = await mk('  padel & yoga ', '2026-11-25T05:00:00Z', null, 'PUBLISHED', 'נוצר ידנית'); // timed, same date (Israel)
    const manualParty = await mk('Padel & Party', null, '2027-03-24', 'DRAFT', 'טיוטה ידנית'); // date-only, same date
    // Same title but another day: NOT a duplicate.
    await mk('Winter Padel', '2027-02-10T05:00:00Z', null, 'PUBLISHED', 'יום אחר');
    const before = await allRows();

    const rows = matchPlan(
      planned(),
      (await admin.query<ExistingEventRef>('select id, import_key, title, status, starts_at, date_start from public.community_events')).rows.map((r) => ({
        ...r,
        starts_at: r.starts_at ? new Date(r.starts_at as unknown as string).toISOString() : null,
      })),
    );
    const action = (key: string) => rows.find((r) => r.event.importKey === key)!;
    expect(action('2026-11-padel-yoga')).toMatchObject({ action: 'SKIP_SIMILAR', match: { id: manualYoga } });
    expect(action('2027-03-padel-party')).toMatchObject({ action: 'SKIP_SIMILAR', match: { id: manualParty } });
    expect(action('2027-01-winter-padel').action).toBe('CREATE');

    expect(await runImport(admin)).toBe(10);
    const after = await allRows();
    // nothing that existed changed, nothing was deleted
    for (const old of before) expect(after.find((r) => r.id === old.id), old.id).toEqual(old);
    expect(after).toHaveLength(before.length + 10);
    expect(after.filter((r) => r.import_key)).toHaveLength(10);
    expect([unrelated, unrelatedDraft].every((id) => after.some((r) => r.id === id))).toBe(true);

    // a re-run is a no-op (the 10 created ones are matched by key, the 2 by title and date)
    expect(await runImport(admin)).toBe(0);
  });

  it('imported events stay hidden from trainees until each is published individually', async () => {
    await cleanSlate();
    const admin = await db.createAdmin();
    const member = await db.createMember();
    await runImport(admin);

    expect((await member.query('select 1 from public.community_events')).rowCount).toBe(0);
    expect((await admin.query('select 1 from public.community_events')).rowCount).toBe(12);

    // publishing one (after the staff adds a real time) shows exactly that one
    const target = (await allRows()).find((r) => r.import_key === '2027-01-winter-padel')!;
    await admin.query(
      "update public.community_events set starts_at = '2027-01-20T05:00:00Z', date_start = null, date_end = null, status = 'PUBLISHED' where id = $1",
      [target.id],
    );
    const visible = (await member.query<{ import_key: string }>('select import_key from public.community_events')).rows;
    expect(visible).toEqual([{ import_key: '2027-01-winter-padel' }]);
  });

  it('a trainee cannot import (insert) events', async () => {
    const member = await db.createMember();
    await expect(
      member.query("insert into public.community_events (import_key, title, status, date_start) values ('trainee-key-1', 'פריצה', 'DRAFT', '2026-11-25')"),
    ).rejects.toThrow(/row-level security|permission denied/);
  });
});
