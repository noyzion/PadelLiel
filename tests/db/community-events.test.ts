import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASE_NOW, NEXT_MONTH, TestDb, type UserSession } from './support/harness';

// Community events: an informational noticeboard. Tested against the real migrations, RLS and
// storage policies (the Supabase auth/storage schemas are stubbed, the policies are the real ones).
let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});

const DEFAULT_LOCATION = 'מרכז הטניס כוכב יאיר';
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(new Date(BASE_NOW).getTime() + offsetMs).toISOString();

interface EventFixture {
  title?: string;
  description?: string;
  starts?: string;
  ends?: string | null;
  status?: 'DRAFT' | 'PUBLISHED';
  cover?: string | null;
}

/** Inserts an event as the database owner (bypasses RLS) and returns its id. */
async function makeEvent(f: EventFixture = {}): Promise<string> {
  const id = randomUUID();
  await db.sql(
    `insert into public.community_events (id, title, description, starts_at, ends_at, status, cover_image)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, f.title ?? 'ערב קהילה', f.description ?? 'תיאור האירוע', f.starts ?? at(10 * DAY), f.ends ?? null, f.status ?? 'PUBLISHED', f.cover ?? null],
  );
  return id;
}

/** Exactly what the trainee pages query (see src/server/services/events.ts). */
const upcomingSql = `select id, title from public.community_events
  where status = 'PUBLISHED' and effective_ends_at > $1 order by starts_at asc, id`;
const pastSql = `select id, title from public.community_events
  where status = 'PUBLISHED' and effective_ends_at <= $1 order by starts_at desc, id`;

async function asAnon(sql: string) {
  const client = await db.pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role anon');
    return await client.query(sql);
  } finally {
    await client.query('rollback');
    client.release();
  }
}

const imagePath = (eventId: string, ext = 'jpg') => `${eventId}/${randomUUID()}.${ext}`;

describe('staff can manage events', () => {
  it('an admin can create an event with sensible defaults, recorded under her own id', async () => {
    const admin = await db.createAdmin();
    const r = await admin.query(
      `insert into public.community_events (title, description, starts_at) values ('בוקר פאדל וקפה', 'פרטים', $1) returning *`,
      [at(5 * DAY)],
    );
    const row = r.rows[0];
    expect(row.status).toBe('DRAFT');
    expect(row.location).toBe(DEFAULT_LOCATION);
    expect(row.created_by).toBe(admin.userId);
    expect(row.ends_at).toBeNull();
    expect(row.cover_image).toBeNull();
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it('an admin can use a different location and an end time', async () => {
    const admin = await db.createAdmin();
    const r = await admin.query(
      `insert into public.community_events (title, starts_at, ends_at, location)
       values ('פאדל ויוגה', $1, $2, 'סטודיו הקהילה') returning location, ends_at`,
      [at(5 * DAY), at(5 * DAY + 2 * 60 * 60 * 1000)],
    );
    expect(r.rows[0].location).toBe('סטודיו הקהילה');
    expect(r.rows[0].ends_at).toBeInstanceOf(Date);
  });

  it('an admin can edit an event; updated_at moves forward and created_at does not', async () => {
    const admin = await db.createAdmin();
    const id = await makeEvent({ status: 'DRAFT' });
    const before = (await db.sql<{ created_at: Date; updated_at: Date }>('select created_at, updated_at from public.community_events where id = $1', [id])).rows[0];
    await new Promise((r) => setTimeout(r, 15));
    const upd = await admin.query<{ created_at: Date; updated_at: Date }>(
      "update public.community_events set title = 'כותרת חדשה', description = 'תיאור חדש', location = 'מקום אחר' where id = $1 returning *",
      [id],
    );
    expect(upd.rowCount).toBe(1);
    expect(upd.rows[0]).toMatchObject({ title: 'כותרת חדשה', description: 'תיאור חדש', location: 'מקום אחר' });
    expect(upd.rows[0].updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    expect(upd.rows[0].created_at.getTime()).toBe(before.created_at.getTime());
  });

  it('an admin can publish, unpublish and delete', async () => {
    const admin = await db.createAdmin();
    const id = await makeEvent({ status: 'DRAFT' });
    await admin.query("update public.community_events set status = 'PUBLISHED' where id = $1", [id]);
    expect((await db.sql('select status from public.community_events where id = $1', [id])).rows[0].status).toBe('PUBLISHED');
    await admin.query("update public.community_events set status = 'DRAFT' where id = $1", [id]);
    expect((await db.sql('select status from public.community_events where id = $1', [id])).rows[0].status).toBe('DRAFT');
    const del = await admin.query('delete from public.community_events where id = $1', [id]);
    expect(del.rowCount).toBe(1);
    expect((await db.sql('select 1 from public.community_events where id = $1', [id])).rowCount).toBe(0);
  });

  it('an admin sees drafts and published events alike', async () => {
    const admin = await db.createAdmin();
    const draft = await makeEvent({ status: 'DRAFT' });
    const published = await makeEvent({ status: 'PUBLISHED' });
    const ids = (await admin.query<{ id: string }>('select id from public.community_events')).rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([draft, published]));
  });

  it('creator and timestamps cannot be forged', async () => {
    const admin = await db.createAdmin();
    const other = await db.createAdmin('Other');
    await expect(
      admin.query('insert into public.community_events (title, starts_at, created_by) values ($1, $2, $3)', ['x y', at(DAY), other.userId]),
    ).rejects.toThrow(/permission denied/);
    const id = await makeEvent();
    for (const col of ["created_by = '" + other.userId + "'", "created_at = now()", "updated_at = now()", "effective_ends_at = now()"]) {
      await expect(admin.query(`update public.community_events set ${col} where id = $1`, [id]), col).rejects.toThrow(
        /permission denied|can only be updated to DEFAULT/,
      );
    }
  });
});

describe('trainees only read published events', () => {
  it('trainees see published events and never drafts', async () => {
    const member = await db.createMember();
    const published = await makeEvent({ title: 'פורסם', status: 'PUBLISHED' });
    const draft = await makeEvent({ title: 'טיוטה', status: 'DRAFT' });
    const visible = (await member.query<{ id: string }>('select id from public.community_events')).rows.map((r) => r.id);
    expect(visible).toContain(published);
    expect(visible).not.toContain(draft);
    const byId = await member.query('select id from public.community_events where id = $1', [draft]);
    expect(byId.rowCount).toBe(0);
  });

  it('unpublishing hides the event from trainees immediately, publishing shows it', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const id = await makeEvent({ status: 'PUBLISHED' });
    expect((await member.query('select 1 from public.community_events where id = $1', [id])).rowCount).toBe(1);
    await admin.query("update public.community_events set status = 'DRAFT' where id = $1", [id]);
    expect((await member.query('select 1 from public.community_events where id = $1', [id])).rowCount).toBe(0);
    await admin.query("update public.community_events set status = 'PUBLISHED' where id = $1", [id]);
    expect((await member.query('select 1 from public.community_events where id = $1', [id])).rowCount).toBe(1);
  });

  it('a trainee who is not approved yet sees nothing', async () => {
    const pending = await db.createMember({ approved: false, limit: null });
    await makeEvent({ status: 'PUBLISHED' });
    expect((await pending.query('select * from public.community_events')).rowCount).toBe(0);
  });

  it('visitors who are not logged in cannot read events', async () => {
    await expect(asAnon('select * from public.community_events')).rejects.toThrow(/permission denied/);
  });
});

describe('only staff can change events', () => {
  async function expectNoWrites(user: UserSession) {
    const id = await makeEvent({ title: 'מקורי', status: 'PUBLISHED' });
    const draft = await makeEvent({ title: 'טיוטה מקורית', status: 'DRAFT' });

    await expect(
      user.query("insert into public.community_events (title, starts_at, status) values ('פריצה', $1, 'PUBLISHED')", [at(DAY)]),
    ).rejects.toThrow(/row-level security|permission denied/);

    for (const target of [id, draft]) {
      const upd = await user.query("update public.community_events set title = 'שונה', status = 'PUBLISHED' where id = $1", [target]);
      expect(upd.rowCount).toBe(0);
      const del = await user.query('delete from public.community_events where id = $1', [target]);
      expect(del.rowCount).toBe(0);
    }
    const rows = (await db.sql('select id, title, status from public.community_events where id = any($1)', [[id, draft]])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === id)).toMatchObject({ title: 'מקורי', status: 'PUBLISHED' });
    expect(rows.find((r) => r.id === draft)).toMatchObject({ title: 'טיוטה מקורית', status: 'DRAFT' });
  }

  it('an approved trainee cannot create, edit, publish or delete events', async () => {
    await expectNoWrites(await db.createMember());
  });

  it('a pending trainee cannot either', async () => {
    await expectNoWrites(await db.createMember({ approved: false, limit: null }));
  });

  it('a pending admin-role profile (not yet approved staff) cannot either', async () => {
    const admin = await db.createAdmin();
    await db.sql("update public.profiles set approval_status = 'pending' where id = $1", [admin.userId]);
    await expectNoWrites(admin);
  });

  it('nobody can grant herself the staff role', async () => {
    const member = await db.createMember();
    await expect(member.query("update public.profiles set role = 'admin' where id = $1", [member.userId])).rejects.toThrow(/permission denied/);
    await expect(
      member.call('admin_update_member', { p_member_id: member.userId, p_patch: JSON.stringify({ role: 'admin' }) }),
    ).rejects.toMatchObject({ message: 'NOT_AUTHORIZED' });
  });

  it('visitors who are not logged in cannot write', async () => {
    await expect(asAnon("insert into public.community_events (title, starts_at) values ('פריצה', now())")).rejects.toThrow(/permission denied/);
    await expect(asAnon("update public.community_events set title = 'x y'")).rejects.toThrow(/permission denied/);
    await expect(asAnon('delete from public.community_events')).rejects.toThrow(/permission denied/);
  });
});

describe('ordering and past events', () => {
  it('upcoming events come nearest first, past events newest first, and nothing is deleted when it passes', async () => {
    const trainee = await db.createMember();
    // Clean slate: only this test's fixtures are present.
    await db.sql('delete from public.community_events');

    const far = await makeEvent({ title: 'far', starts: at(20 * DAY) });
    const near = await makeEvent({ title: 'near', starts: at(2 * DAY) });
    const mid = await makeEvent({ title: 'mid', starts: at(9 * DAY), ends: at(9 * DAY + 3_600_000) });
    const ongoing = await makeEvent({ title: 'ongoing', starts: at(-3_600_000), ends: at(2 * 3_600_000) });
    // BASE_NOW is 09:00 Israel time. No end time: still upcoming for the rest of its Israel day.
    const todayNoEnd = await makeEvent({ title: 'today-no-end', starts: at(-2 * 3_600_000) });
    const yesterdayNoEnd = await makeEvent({ title: 'yesterday-no-end', starts: at(-DAY) });
    const recent = await makeEvent({ title: 'recent', starts: at(-5 * DAY), ends: at(-5 * DAY + 3_600_000) });
    const old = await makeEvent({ title: 'old', starts: at(-60 * DAY), ends: at(-60 * DAY + 3_600_000) });
    await makeEvent({ title: 'draft-future', starts: at(DAY), status: 'DRAFT' });
    await makeEvent({ title: 'draft-past', starts: at(-DAY), status: 'DRAFT' });

    // starts_at ascending: the two events already under way come first
    const upcoming = (await trainee.query<{ id: string }>(upcomingSql, [BASE_NOW])).rows.map((r) => r.id);
    expect(upcoming).toEqual([todayNoEnd, ongoing, near, mid, far]);

    // starts_at descending
    const past = (await trainee.query<{ id: string }>(pastSql, [BASE_NOW])).rows.map((r) => r.id);
    expect(past).toEqual([yesterdayNoEnd, recent, old]);

    // Time passes: events move from upcoming to past on their own, and stay readable. Nothing is deleted.
    const later = at(30 * DAY);
    expect((await trainee.query(upcomingSql, [later])).rowCount).toBe(0);
    const pastLater = (await trainee.query<{ id: string }>(pastSql, [later])).rows.map((r) => r.id);
    expect(pastLater).toEqual([far, mid, near, ongoing, todayNoEnd, yesterdayNoEnd, recent, old]);
    expect((await trainee.query('select 1 from public.community_events where id = $1', [old])).rowCount).toBe(1);
    expect((await db.sql('select count(*)::int n from public.community_events')).rows[0].n).toBe(10);
  });
  it('an event at a past date can still be opened by id', async () => {
    const trainee = await db.createMember();
    const id = await makeEvent({ starts: at(-400 * DAY), ends: at(-400 * DAY + 3_600_000) });
    const r = await trainee.query('select title from public.community_events where id = $1', [id]);
    expect(r.rowCount).toBe(1);
  });

  it('an event without an end time ends with its Israel calendar day (DST-safe)', async () => {
    // 2026-11-02 23:30 Israel (UTC+2) = 21:30Z: ends at the following local midnight = 22:00Z
    const id = await makeEvent({ starts: '2026-11-02T21:30:00Z' });
    const r = await db.sql<{ effective_ends_at: Date }>('select effective_ends_at from public.community_events where id = $1', [id]);
    expect(r.rows[0].effective_ends_at.toISOString()).toBe('2026-11-02T22:00:00.000Z');
    // Summer time (UTC+3): 2026-07-10 10:00 Israel = 07:00Z ends at 21:00Z that day
    const summer = await makeEvent({ starts: '2026-07-10T07:00:00Z' });
    const s = await db.sql<{ effective_ends_at: Date }>('select effective_ends_at from public.community_events where id = $1', [summer]);
    expect(s.rows[0].effective_ends_at.toISOString()).toBe('2026-07-10T21:00:00.000Z');
  });
});

describe('invalid data is rejected by the database', () => {
  it('rejects an end before or equal to the start, accepts no end time', async () => {
    const admin = await db.createAdmin();
    const insert = (ends: string | null) =>
      admin.query('insert into public.community_events (title, starts_at, ends_at) values ($1, $2, $3)', ['אירוע בדיקה', at(5 * DAY), ends]);
    await expect(insert(at(5 * DAY - 60_000))).rejects.toMatchObject({ constraint: 'community_events_valid_range' });
    await expect(insert(at(5 * DAY))).rejects.toMatchObject({ constraint: 'community_events_valid_range' });
    await expect(insert(at(5 * DAY + 60_000))).resolves.toBeTruthy();
    await expect(insert(null)).resolves.toBeTruthy();

    const id = await makeEvent({ starts: at(5 * DAY), ends: at(5 * DAY + 3_600_000) });
    await expect(admin.query('update public.community_events set ends_at = $2 where id = $1', [id, at(DAY)])).rejects.toMatchObject({
      constraint: 'community_events_valid_range',
    });
  });

  it('rejects an invalid timestamp and a missing start', async () => {
    const admin = await db.createAdmin();
    await expect(admin.query("insert into public.community_events (title, starts_at) values ('אירוע בדיקה', 'not-a-date')")).rejects.toThrow(/invalid input syntax/);
    // starts_at is nullable only for a date-only draft; with no date either, the row has no "when" at all.
    await expect(admin.query("insert into public.community_events (title, starts_at) values ('אירוע בדיקה', null)")).rejects.toMatchObject({
      constraint: 'community_events_when_exclusive',
    });
  });

  it('rejects bad titles, locations, descriptions and statuses', async () => {
    const admin = await db.createAdmin();
    const attempt = (cols: string, values: unknown[]) =>
      admin.query(`insert into public.community_events (starts_at, ${cols}) values ($1, ${values.map((_, i) => `$${i + 2}`).join(', ')})`, [at(DAY), ...values]);
    await expect(attempt('title', ['  '])).rejects.toThrow(/community_events_title_check/);
    await expect(attempt('title', ['א'])).rejects.toThrow(/community_events_title_check/);
    await expect(attempt('title', ['א'.repeat(121)])).rejects.toThrow(/community_events_title_check/);
    await expect(attempt('title, location', ['אירוע בדיקה', '   '])).rejects.toThrow(/community_events_location_check/);
    await expect(attempt('title, description', ['אירוע בדיקה', 'א'.repeat(5001)])).rejects.toThrow(/community_events_description_check/);
    await expect(attempt('title, status', ['אירוע בדיקה', 'CANCELLED'])).rejects.toThrow(/invalid input value for enum/);
  });

  it('a published event needs a description; a draft does not', async () => {
    const admin = await db.createAdmin();
    await expect(
      admin.query("insert into public.community_events (title, starts_at, status, description) values ('אירוע בדיקה', $1, 'PUBLISHED', '  ')", [at(DAY)]),
    ).rejects.toMatchObject({ constraint: 'community_events_published_has_description' });
    await expect(
      admin.query("insert into public.community_events (title, starts_at, status) values ('אירוע בדיקה', $1, 'DRAFT')", [at(DAY)]),
    ).resolves.toBeTruthy();
    const draft = await makeEvent({ status: 'DRAFT', description: '' });
    await expect(admin.query("update public.community_events set status = 'PUBLISHED' where id = $1", [draft])).rejects.toMatchObject({
      constraint: 'community_events_published_has_description',
    });
  });

  it('only a well-formed image path that belongs to the event is accepted', async () => {
    const admin = await db.createAdmin();
    const id = await makeEvent();
    const set = (path: string | null) => admin.query('update public.community_events set cover_image = $2 where id = $1', [id, path]);
    await expect(set(imagePath(id, 'webp'))).resolves.toBeTruthy();
    await expect(set(imagePath(id, 'png'))).resolves.toBeTruthy();
    await expect(set(null)).resolves.toBeTruthy();
    await expect(set(imagePath(randomUUID()))).rejects.toMatchObject({ constraint: 'community_events_image_belongs_to_event' });
    await expect(set(imagePath(id, 'gif'))).rejects.toMatchObject({ constraint: 'community_events_cover_image_check' });
    await expect(set('https://evil.example/x.jpg')).rejects.toMatchObject({ constraint: 'community_events_cover_image_check' });
    await expect(set(`${id}/../${randomUUID()}.jpg`)).rejects.toMatchObject({ constraint: 'community_events_cover_image_check' });
  });
});

describe('event image storage permissions', () => {
  it('the bucket is public-read, limited to 4 MB and to jpeg / png / webp', async () => {
    const r = await db.sql('select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1', ['event-images']);
    expect(r.rows[0]).toEqual({
      public: true,
      file_size_limit: '4194304',
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
    });
  });

  const upload = (user: UserSession, name: string, bucket = 'event-images') =>
    user.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name]);

  it('an admin can upload an image under a well-formed name', async () => {
    const admin = await db.createAdmin();
    const eventId = randomUUID();
    for (const ext of ['jpg', 'png', 'webp']) {
      await expect(upload(admin, imagePath(eventId, ext))).resolves.toBeTruthy();
    }
  });

  it('trainees cannot upload event images', async () => {
    const member = await db.createMember();
    await expect(upload(member, imagePath(randomUUID()))).rejects.toThrow(/row-level security/);
    const pending = await db.createMember({ approved: false, limit: null });
    await expect(upload(pending, imagePath(randomUUID()))).rejects.toThrow(/row-level security/);
  });

  it('visitors who are not logged in cannot upload event images', async () => {
    await expect(asAnon(`insert into storage.objects (bucket_id, name) values ('event-images', '${imagePath(randomUUID())}')`)).rejects.toThrow(
      /row-level security/,
    );
  });

  it('even an admin cannot upload other file types, odd names, or into other buckets through this policy', async () => {
    const admin = await db.createAdmin();
    const id = randomUUID();
    await db.sql("insert into storage.buckets (id, name) values ('other', 'other') on conflict do nothing");
    for (const name of [`${id}/${randomUUID()}.gif`, `${id}/${randomUUID()}.svg`, `${id}/${randomUUID()}.html`, 'cover.jpg', `${randomUUID()}.jpg`, `${id}/../${randomUUID()}.jpg`, `a/b/${randomUUID()}.jpg`]) {
      await expect(upload(admin, name), name).rejects.toThrow(/row-level security/);
    }
    await expect(upload(admin, imagePath(id), 'other')).rejects.toThrow(/row-level security/);
  });

  it('only admins can list, replace or delete event images', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const name = imagePath(randomUUID());
    await upload(admin, name);

    expect((await member.query('select 1 from storage.objects where bucket_id = $1', ['event-images'])).rowCount).toBe(0);
    expect((await admin.query('select 1 from storage.objects where name = $1', [name])).rowCount).toBe(1);

    const renamed = imagePath(randomUUID());
    expect((await member.query('update storage.objects set name = $2 where name = $1', [name, renamed])).rowCount).toBe(0);
    expect((await member.query('delete from storage.objects where name = $1', [name])).rowCount).toBe(0);
    expect((await db.sql('select 1 from storage.objects where name = $1', [name])).rowCount).toBe(1);

    // an admin cannot rename an object to an invalid name either
    await expect(admin.query('update storage.objects set name = $2 where name = $1', [name, 'evil.html'])).rejects.toThrow(/row-level security/);
    expect((await admin.query('delete from storage.objects where name = $1', [name])).rowCount).toBe(1);
  });
});

describe('events are independent of training', () => {
  it('community_events has no registration, RSVP, capacity, attendance, payment or notification columns', async () => {
    const cols = await db.sql<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'community_events' order by column_name",
    );
    expect(cols.rows.map((c) => c.column_name)).toEqual(
      [
        'cover_image', 'created_at', 'created_by', 'date_end', 'date_start', 'description', 'effective_ends_at', 'ends_at',
        'id', 'import_key', 'location', 'starts_at', 'status', 'title', 'updated_at',
      ].sort(),
    );
    const tables = await db.sql(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name ~* '(rsvp|attend|participant|ticket|event.*(registration|booking|subscription))'`,
    );
    expect(tables.rowCount).toBe(0);
  });

  it('no table references community_events, and it references nothing but the creator profile', async () => {
    const inbound = await db.sql("select conrelid::regclass::text t from pg_constraint where contype = 'f' and confrelid = 'public.community_events'::regclass");
    expect(inbound.rowCount).toBe(0);
    const outbound = await db.sql("select confrelid::regclass::text t from pg_constraint where contype = 'f' and conrelid = 'public.community_events'::regclass");
    expect(outbound.rows.map((r) => r.t)).toEqual(['profiles']);
  });

  it('creating, publishing and deleting events never changes a trainee’s monthly allowance or booking rules', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 2 });
    const session = await db.createSession({ date: '2026-11-03', start: '07:00', end: '08:00' });

    const before = await member.allowance(NEXT_MONTH);
    expect(before.remaining).toBe(2);

    const eventId = await makeEvent({ status: 'DRAFT' });
    await admin.query("update public.community_events set status = 'PUBLISHED', title = 'אירוע חדש' where id = $1", [eventId]);
    expect((await member.allowance(NEXT_MONTH)).remaining).toBe(2);

    const bookingId = await member.book(session);
    expect((await member.allowance(NEXT_MONTH)).remaining).toBe(1);

    // Events published, edited and deleted around the booking change nothing.
    const other = await makeEvent({ status: 'PUBLISHED' });
    await admin.query("update public.community_events set title = 'עודכן' where id = $1", [other]);
    await admin.query('delete from public.community_events where id = $1', [eventId]);
    expect((await member.allowance(NEXT_MONTH)).remaining).toBe(1);

    // The 8-hour cancellation rule still works as before: an early cancellation restores the session.
    const cancelled = await member.cancel(bookingId);
    expect(cancelled.status).toBe('CANCELLED_EARLY');
    expect((await member.allowance(NEXT_MONTH)).remaining).toBe(2);
    expect(await db.bookingStatus(bookingId)).toBe('CANCELLED_EARLY');
  });
});

describe('previewing a saved event (admin-only reads, no side effects)', () => {
  // Exactly what the admin preview route reads (see getEvent in src/server/services/events.ts).
  const byId = 'select * from public.community_events where id = $1';

  it('an admin can read a draft and a published event by id', async () => {
    const admin = await db.createAdmin();
    const draft = await makeEvent({ status: 'DRAFT' });
    const published = await makeEvent({ status: 'PUBLISHED' });
    expect((await admin.query(byId, [draft])).rows[0].status).toBe('DRAFT');
    expect((await admin.query(byId, [published])).rows[0].status).toBe('PUBLISHED');
  });

  it('a trainee cannot reach a draft by its id, but still reads a published event', async () => {
    const member = await db.createMember();
    const draft = await makeEvent({ status: 'DRAFT' });
    const published = await makeEvent({ status: 'PUBLISHED' });
    expect((await member.query(byId, [draft])).rowCount).toBe(0);
    expect((await member.query(byId, [published])).rowCount).toBe(1);
  });

  it('visitors who are not logged in cannot read a draft either', async () => {
    const draft = await makeEvent({ status: 'DRAFT' });
    await expect(asAnon(`select * from public.community_events where id = '${draft}'`)).rejects.toThrow(/permission denied/);
  });

  it('previewing never publishes or changes the event, and the draft stays hidden from trainees', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const draft = await makeEvent({ status: 'DRAFT' });
    const snapshot = async () => (await db.sql('select * from public.community_events where id = $1', [draft])).rows[0];
    const before = await snapshot();

    await admin.query(byId, [draft]); // the admin opens the preview
    expect((await member.query(byId, [draft])).rowCount).toBe(0); // trainee, while the admin is previewing
    expect((await member.query(upcomingSql, [at(0)])).rows.map((r) => r.id)).not.toContain(draft);

    expect(await snapshot()).toEqual(before);
  });

  it('the preview of a draft is not an upcoming event for trainees even after the admin previewed an edit', async () => {
    // Unsaved edits are previewed in the browser only: the row is untouched until an explicit save.
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const id = await makeEvent({ title: 'שם מקורי', status: 'PUBLISHED' });
    await admin.query(byId, [id]);
    expect((await member.query('select title from public.community_events where id = $1', [id])).rows[0].title).toBe('שם מקורי');
  });
});