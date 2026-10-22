import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BASE_NOW, NEXT_MONTH, TestDb } from './support/harness';

const SECRET = 'test-dispatcher-secret-0123456789abcdef';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
  const hash = createHash('sha256').update(SECRET).digest('hex');
  await db.sql('insert into public.notification_worker_config (secret_sha256) values ($1) on conflict (id) do update set secret_sha256 = excluded.secret_sha256', [
    hash,
  ]);
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.setNow(BASE_NOW);
  await db.sql(
    `truncate public.event_rsvps, public.community_events, public.notification_jobs, public.notifications,
              public.push_subscriptions, public.bookings, public.sessions cascade`,
  );
  await db.sql('delete from auth.users');
});
afterEach(async () => {
  await db.setNow(BASE_NOW);
});

const code = (c: string) => expect.objectContaining({ message: c });

async function makeEvent(opts: { starts: string; ends?: string | null; status?: 'DRAFT' | 'PUBLISHED'; title?: string }) {
  const id = randomUUID();
  await db.sql(
    `insert into public.community_events (id, title, description, starts_at, ends_at, status)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, opts.title ?? 'Padel & Yoga', 'בוקר קהילה', opts.starts, opts.ends ?? null, opts.status ?? 'PUBLISHED'],
  );
  return id;
}

async function jobs(userId: string) {
  const r = await db.sql<{
    status: string;
    scheduled_for: string;
    notification_type: string;
    event_id: string | null;
  }>(
    `select status, notification_type, event_id::text,
            to_char(scheduled_for at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as scheduled_for
       from public.notification_jobs
      where user_id = $1 and notification_type = 'event_rsvp_reminder'
      order by created_at, id`,
    [userId],
  );
  return r.rows;
}

async function claim() {
  const r = await db.sql<{ r: { title: string; message: string; url: string; type: string }[] }>(
    'select public.worker_claim_jobs($1, 50) as r',
    [SECRET],
  );
  return r.rows[0].r;
}

describe('set_event_rsvp', () => {
  it('lets an approved trainee confirm or decline, and change her mind', async () => {
    const member = await db.createMember();
    const eventId = await makeEvent({ starts: '2026-10-30T07:00:00Z' });

    expect(await member.call<string>('set_event_rsvp', { p_event_id: eventId, p_status: 'GOING' })).toBe('GOING');
    expect(await member.call<string>('set_event_rsvp', { p_event_id: eventId, p_status: 'NOT_GOING' })).toBe('NOT_GOING');

    const row = await member.query<{ status: string }>('select status from public.event_rsvps where event_id = $1', [eventId]);
    expect(row.rows[0].status).toBe('NOT_GOING');
  });

  it('rejects drafts, ended events, bad status, and non-trainees', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const pending = await db.createMember({ approved: false });
    const draft = await makeEvent({ starts: '2026-10-30T07:00:00Z', status: 'DRAFT' });
    const live = await makeEvent({ starts: '2026-10-30T07:00:00Z' });
    const past = await makeEvent({ starts: '2026-10-28T07:00:00Z', ends: '2026-10-28T09:00:00Z' });

    await expect(member.call('set_event_rsvp', { p_event_id: draft, p_status: 'GOING' })).rejects.toMatchObject(code('EVENT_NOT_PUBLISHED'));
    await expect(member.call('set_event_rsvp', { p_event_id: past, p_status: 'GOING' })).rejects.toMatchObject(code('EVENT_ALREADY_ENDED'));
    await expect(member.call('set_event_rsvp', { p_event_id: live, p_status: 'MAYBE' })).rejects.toMatchObject(code('INVALID_INPUT'));
    await expect(admin.call('set_event_rsvp', { p_event_id: live, p_status: 'GOING' })).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    await expect(pending.call('set_event_rsvp', { p_event_id: live, p_status: 'GOING' })).rejects.toMatchObject(code('NOT_AUTHORIZED'));
  });

  it('hides other trainees’ answers; the coach can read the roster', async () => {
    const dana = await db.createMember({ name: 'דנה' });
    const noa = await db.createMember({ name: 'נועה' });
    const admin = await db.createAdmin();
    const eventId = await makeEvent({ starts: '2026-10-30T07:00:00Z' });
    await dana.call('set_event_rsvp', { p_event_id: eventId, p_status: 'GOING' });
    await noa.call('set_event_rsvp', { p_event_id: eventId, p_status: 'NOT_GOING' });

    expect((await dana.query('select member_id from public.event_rsvps')).rowCount).toBe(1);
    const roster = await admin.rpc<{ full_name: string; status: string }>('admin_list_event_rsvps', { p_event_id: eventId });
    expect(roster.map((r) => ({ name: r.full_name, status: r.status }))).toEqual([
      { name: 'דנה', status: 'GOING' },
      { name: 'נועה', status: 'NOT_GOING' },
    ]);
    await expect(dana.rpc('admin_list_event_rsvps', { p_event_id: eventId })).rejects.toMatchObject(code('NOT_AUTHORIZED'));
  });

  it('never changes a trainee’s monthly allowance', async () => {
    const member = await db.createMember({ limit: 2 });
    const session = await db.createSession({ date: '2026-11-03', start: '07:00', end: '08:00' });
    const eventId = await makeEvent({ starts: '2026-10-30T07:00:00Z' });
    await member.book(session);
    await member.call('set_event_rsvp', { p_event_id: eventId, p_status: 'GOING' });
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ used: 1, remaining: 1 });
  });
});

describe('24h RSVP reminder', () => {
  it('schedules a job 24 hours before the start for every approved trainee', async () => {
    const member = await db.createMember();
    const other = await db.createMember({ name: 'Other' });
    const admin = await db.createAdmin();
    const eventId = await makeEvent({ starts: '2026-10-31T07:00:00Z' }); // 48h after BASE_NOW

    const mine = await jobs(member.userId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      status: 'pending',
      event_id: eventId,
      scheduled_for: '2026-10-30T07:00:00Z',
    });
    expect(await jobs(other.userId)).toHaveLength(1);
    expect(await jobs(admin.userId)).toHaveLength(0);
  });

  it('sends immediately when the event is already inside 24 hours, with the cute copy', async () => {
    const member = await db.createMember();
    const eventId = await makeEvent({ starts: '2026-10-30T07:00:00Z', title: 'Padel & Yoga' }); // 24h from BASE_NOW

    const scheduled = await jobs(member.userId);
    expect(scheduled[0].scheduled_for).toBe('2026-10-29T07:00:00Z');

    const claimed = await claim();
    expect(claimed).toHaveLength(0); // no Push device
    const n = await member.query<{ title: string; message: string; destination_url: string; type: string }>(
      'select title, message, destination_url, type from public.notifications',
    );
    expect(n.rows[0]).toEqual({
      type: 'event_rsvp_reminder',
      title: 'באות?',
      message: 'מחר יש «Padel & Yoga». נשמח לאישור הגעה, כדי שנדע לחכות לך 💛🎾',
      destination_url: `/events/${eventId}`,
    });
  });

  it('matches event_rsvp_prompt_copy for today / tomorrow / soon', async () => {
    const tomorrow = await db.sql<{ title: string; message: string }>(
      `select * from public.event_rsvp_prompt_copy('Padel & Yoga', '2026-10-30T07:00:00Z', '2026-10-29')`,
    );
    expect(tomorrow.rows[0]).toEqual({
      title: 'באות?',
      message: 'מחר יש «Padel & Yoga». נשמח לאישור הגעה, כדי שנדע לחכות לך 💛🎾',
    });
    const today = await db.sql<{ message: string }>(
      `select message from public.event_rsvp_prompt_copy('Padel & Yoga', '2026-10-29T16:00:00Z', '2026-10-29')`,
    );
    expect(today.rows[0].message).toContain('היום יש «Padel & Yoga»');
    const soon = await db.sql<{ message: string }>(
      `select message from public.event_rsvp_prompt_copy('Padel & Yoga', '2026-10-31T07:00:00Z', '2026-10-29')`,
    );
    expect(soon.rows[0].message).toContain('עוד מעט יש «Padel & Yoga»');
  });

  it('does not ping someone who already answered, and cancels a pending job on RSVP', async () => {
    const member = await db.createMember();
    const eventId = await makeEvent({ starts: '2026-10-31T07:00:00Z' });
    expect(await jobs(member.userId)).toHaveLength(1);

    await member.call('set_event_rsvp', { p_event_id: eventId, p_status: 'GOING' });
    expect((await jobs(member.userId))[0].status).toBe('cancelled');

    await db.setNow('2026-10-30T07:00:00Z');
    await claim();
    expect((await member.query('select 1 from public.notifications')).rowCount).toBe(0);
  });

  it('skips a draft and cancels jobs when the event is unpublished', async () => {
    const member = await db.createMember();
    const admin = await db.createAdmin();
    const eventId = await makeEvent({ starts: '2026-10-31T07:00:00Z' });
    expect(await jobs(member.userId)).toHaveLength(1);

    await admin.query("update public.community_events set status = 'DRAFT' where id = $1", [eventId]);
    expect((await jobs(member.userId))[0].status).toBe('cancelled');
  });

  it('gives a newly approved trainee a job for an already-published upcoming event', async () => {
    const eventId = await makeEvent({ starts: '2026-10-31T07:00:00Z' });
    const member = await db.createMember({ approved: false, name: 'New' });
    expect(await jobs(member.userId)).toHaveLength(0);

    await db.sql("update public.profiles set approval_status = 'approved' where id = $1", [member.userId]);
    const created = await jobs(member.userId);
    expect(created).toHaveLength(1);
    expect(created[0].event_id).toBe(eventId);
  });
});

describe('prompt window query (what the app popup uses)', () => {
  it('returns a published event in the next 24 hours that the trainee has not answered', async () => {
    const member = await db.createMember();
    const soon = await makeEvent({ starts: '2026-10-30T05:00:00Z' });
    const later = await makeEvent({ starts: '2026-11-02T07:00:00Z' });
    const answered = await makeEvent({ starts: '2026-10-30T06:00:00Z' });
    await member.call('set_event_rsvp', { p_event_id: answered, p_status: 'GOING' });

    const r = await member.query<{ id: string }>(
      `select id from public.community_events e
        where e.status = 'PUBLISHED'
          and e.effective_ends_at > public.app_now()
          and e.effective_starts_at <= public.app_now() + interval '24 hours'
          and not exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.member_id = $1)
        order by e.effective_starts_at, e.id`,
      [member.userId],
    );
    expect(r.rows.map((row) => row.id)).toEqual([soon]);
    expect(r.rows.map((row) => row.id)).not.toContain(later);
    expect(r.rows.map((row) => row.id)).not.toContain(answered);
  });
});
