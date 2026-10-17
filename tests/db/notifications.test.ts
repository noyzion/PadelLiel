import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BASE_NOW, NEXT_WEEK, THIS_WEEK, TestDb, type UserSession } from './support/harness';

/**
 * Notifications: in-app records, scheduled reminders, the Push outbox and its security model.
 * Real PostgreSQL (the production migrations) with a controllable clock.
 *
 * Reference session: Monday 2026-11-02 07:00 Israel time (UTC+2) = 2026-11-02T05:00:00Z
 *   24h reminder        = 2026-11-01T05:00:00Z (Sunday 07:00)
 *   free-cancel deadline = 2026-11-01T21:00:00Z (Sunday 23:00); reminder one hour earlier = 20:00Z (22:00 local)
 */
const SECRET = 'test-dispatcher-secret-0123456789abcdef';
const MONDAY = '2026-11-02';
const REMINDER_24H = '2026-11-01T05:00:00Z';
const REMINDER_DEADLINE = '2026-11-01T20:00:00Z';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
  const hash = createHash('sha256').update(SECRET).digest('hex');
  await db.sql('insert into public.notification_worker_config (secret_sha256) values ($1)', [hash]);
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.setNow(BASE_NOW);
  // Every test starts from an empty community (one weekly announcement per week would otherwise leak).
  await db.sql(
    `truncate public.bookings, public.waitlist_entries, public.allowance_adjustments, public.sessions,
              public.notification_jobs, public.notifications, public.notification_broadcasts,
              public.push_subscriptions, public.notification_preferences cascade`,
  );
  await db.sql('delete from auth.users');
});
afterEach(async () => {
  await db.setNow(BASE_NOW);
});

const code = (c: string) => expect.objectContaining({ message: c });

interface Claimed {
  job_id: string;
  notification_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  url: string;
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[];
}

async function claim(limit = 50, secret = SECRET): Promise<Claimed[]> {
  const r = await db.sql<{ r: Claimed[] }>('select public.worker_claim_jobs($1, $2) as r', [secret, limit]);
  return r.rows[0].r;
}

async function complete(jobId: string, opts: { delivered?: string[]; retry?: string[]; gone?: string[]; error?: string } = {}) {
  const r = await db.sql<{ r: string }>('select public.worker_complete_job($1, $2, $3, $4, $5, $6) as r', [
    SECRET,
    jobId,
    opts.delivered ?? [],
    opts.retry ?? [],
    opts.gone ?? [],
    opts.error ?? null,
  ]);
  return r.rows[0].r;
}

async function notificationsOf(member: UserSession) {
  const r = await member.query<{ id: string; type: string; title: string; message: string; destination_url: string | null; read_at: string | null }>(
    'select id, type, title, message, destination_url, read_at from public.notifications order by created_at, id',
  );
  return r.rows;
}

async function addSubscription(userId: string, tag: string = randomUUID()) {
  const r = await db.sql<{ id: string }>(
    'insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4) returning id',
    [userId, `https://push.example.test/${tag}`, 'p256dh-key', 'auth-secret'],
  );
  return r.rows[0].id;
}

async function jobs(userId: string, type?: string) {
  const r = await db.sql<{ id: string; notification_type: string; status: string; scheduled_for: string; attempts: number; notification_id: string | null }>(
    `select id, notification_type, status, to_char(scheduled_for at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') as scheduled_for, attempts, notification_id
       from public.notification_jobs where user_id = $1 and ($2::text is null or notification_type = $2) order by created_at, id`,
    [userId, type ?? null],
  );
  return r.rows;
}

async function bookMonday(opts: { limit?: number; date?: string; start?: string } = {}) {
  const member = await db.createMember({ limit: opts.limit ?? 4 });
  const session = await db.createSession({ date: opts.date ?? MONDAY, start: opts.start ?? '07:00', end: '08:00' });
  const bookingId = await member.book(session);
  return { member, session, bookingId };
}

async function asAnon<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const client = await db.pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role anon');
    const result = await client.query<T>(sql, params);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */

describe('booking confirmation', () => {
  it('creates an unread in-app notification with the exact Hebrew text and a link to the bookings page', async () => {
    const { member } = await bookMonday();
    const list = await notificationsOf(member);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      type: 'booking_confirmed',
      title: 'נרשמת לאימון בהצלחה',
      message: 'האימון שלך נקבע ליום שני, 2.11, בשעה 07:00. נתראה על המגרש!',
      destination_url: '/bookings',
      read_at: null,
    });
  });

  it('is created for a booking the coach assigns', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const session = await db.createSession({ date: MONDAY });
    await admin.rpc('admin_assign_booking', { p_session_id: session, p_member_id: member.userId });
    expect(await notificationsOf(member)).toHaveLength(1);
    expect((await notificationsOf(member))[0].type).toBe('booking_confirmed');
  });

  it('is created when a waiting-list entry is promoted into a booking', async () => {
    const admin = await db.createAdmin();
    const holder = await db.createMember();
    const waiter = await db.createMember();
    const session = await db.createSession({ date: MONDAY, capacity: 1 });
    const held = await holder.book(session);
    await waiter.call('join_waitlist', { p_session_id: session });
    expect(await notificationsOf(waiter)).toHaveLength(0);

    await holder.cancel(held);
    const entry = (
      await db.sql<{ id: string }>('select id from public.waitlist_entries where member_id = $1 and status = $2', [
        waiter.userId,
        'WAITING',
      ])
    ).rows[0].id;
    await admin.call('admin_promote_waitlist_entry', { p_entry_id: entry });
    const list = await notificationsOf(waiter);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'booking_confirmed', title: 'נרשמת לאימון בהצלחה' });
  });

  it('creates NOTHING for a booking that fails', async () => {
    const full = await db.createMember({ limit: 4 });
    const other = await db.createMember({ limit: 4 });
    const session = await db.createSession({ date: MONDAY, capacity: 1 });
    await full.book(session);
    await expect(other.book(session)).rejects.toMatchObject(code('SESSION_FULL'));
    expect(await notificationsOf(other)).toHaveLength(0);

    const noPlan = await db.createMember({ limit: null });
    await expect(noPlan.book(session)).rejects.toThrow();
    expect(await notificationsOf(noPlan)).toHaveLength(0);

    const pending = await db.createMember({ approved: false });
    await expect(pending.book(session)).rejects.toThrow();
    expect(await db.sql('select 1 from public.notifications where user_id = $1', [pending.userId])).toHaveProperty('rowCount', 0);
  });

  it('a notification problem never blocks the booking', async () => {
    const member = await db.createMember();
    const session = await db.createSession({ date: MONDAY });
    await db.sql('alter table public.notifications rename to notifications_broken');
    try {
      await expect(member.book(session)).resolves.toBeTruthy();
    } finally {
      await db.sql('alter table public.notifications_broken rename to notifications');
    }
    expect(await db.occupied(session)).toBe(1);
  });

  it('creates a Push job only when the trainee has a Push subscription, and leaves the booking untouched', async () => {
    const withPush = await db.createMember();
    await addSubscription(withPush.userId);
    const without = await db.createMember();
    const s1 = await db.createSession({ date: MONDAY, start: '07:00' });
    const s2 = await db.createSession({ date: MONDAY, start: '09:00', end: '10:00' });
    await withPush.book(s1);
    await without.book(s2);
    expect(await jobs(withPush.userId, 'booking_confirmed')).toHaveLength(1);
    expect(await jobs(without.userId, 'booking_confirmed')).toHaveLength(0);
  });
});

describe('reminder scheduling', () => {
  it('schedules the 24h reminder and the deadline reminder from the real session start and cutoff', async () => {
    const { member } = await bookMonday();
    expect(await jobs(member.userId, 'training_reminder')).toMatchObject([{ status: 'pending', scheduled_for: REMINDER_24H }]);
    // cutoff 8h -> deadline Sunday 23:00 local, reminder Sunday 22:00 local
    expect(await jobs(member.userId, 'cancellation_deadline')).toMatchObject([{ status: 'pending', scheduled_for: REMINDER_DEADLINE }]);
  });

  it('follows the configured cancellation cutoff (not a hard-coded 8 hours) and re-plans when it changes', async () => {
    await db.sql("update public.app_settings set value = '12' where key = 'cancellation_cutoff_hours'");
    try {
      const { member } = await bookMonday();
      // deadline = start - 12h = 2026-11-01T17:00Z -> reminder 16:00Z
      expect(await jobs(member.userId, 'cancellation_deadline')).toMatchObject([{ scheduled_for: '2026-11-01T16:00:00Z' }]);

      await db.sql("update public.app_settings set value = '2' where key = 'cancellation_cutoff_hours'");
      // deadline = start - 2h = 03:00Z -> reminder Monday 02:00Z
      expect(await jobs(member.userId, 'cancellation_deadline')).toMatchObject([{ status: 'pending', scheduled_for: '2026-11-02T02:00:00Z' }]);
    } finally {
      await db.sql("update public.app_settings set value = '8' where key = 'cancellation_cutoff_hours'");
    }
  });

  it('skips a reminder whose moment has already passed when the trainee books late', async () => {
    // 10h before the start: the 24h reminder is missed, the deadline reminder (at -9h) is still ahead.
    await db.setNow('2026-11-01T19:00:00Z');
    const { member } = await bookMonday();
    expect(await jobs(member.userId, 'training_reminder')).toHaveLength(0);
    expect(await jobs(member.userId, 'cancellation_deadline')).toHaveLength(1);

    // 7h before the start: the free-cancellation deadline has passed too -> no reminder jobs at all.
    const later = await db.createMember();
    const s = await db.createSession({ date: MONDAY, start: '07:00' });
    await db.setNow('2026-11-01T22:00:00Z');
    await later.book(s, true);
    expect(await jobs(later.userId)).toMatchObject([]);
  });

  it('boundary: booking exactly 24h before the start does not schedule a (due-now) 24h reminder', async () => {
    await db.setNow(REMINDER_24H);
    const { member } = await bookMonday();
    expect(await jobs(member.userId, 'training_reminder')).toHaveLength(0);
  });

  it('daylight saving: reminders are exactly 24h / (cutoff+1h) before the real start instant', async () => {
    // DST ended Sun 2026-10-25 01:00 (Israel): Sunday 07:00 local is UTC+2 = 05:00Z, so the 24h-earlier
    // instant is Saturday 08:00 local (UTC+3) - the reminder is 24 real hours before, not "same clock time".
    await db.setNow('2026-10-20T09:00:00Z');
    const a = await bookMonday({ date: '2026-10-25', start: '07:00' });
    expect(await jobs(a.member.userId, 'training_reminder')).toMatchObject([{ scheduled_for: '2026-10-24T05:00:00Z' }]);
    // deadline = start - 8h = Fri 2026-10-24 21:00Z, reminder one hour earlier
    expect(await jobs(a.member.userId, 'cancellation_deadline')).toMatchObject([{ scheduled_for: '2026-10-24T20:00:00Z' }]);

    // DST starts Fri 2027-03-26 02:00: Saturday 07:00 local is UTC+3 = 04:00Z.
    await db.setNow('2027-03-20T09:00:00Z');
    const b = await bookMonday({ date: '2027-03-27', start: '07:00' });
    expect(await jobs(b.member.userId, 'training_reminder')).toMatchObject([{ scheduled_for: '2027-03-26T04:00:00Z' }]);
    expect(await jobs(b.member.userId, 'cancellation_deadline')).toMatchObject([{ scheduled_for: '2027-03-26T19:00:00Z' }]);
  });

  it('re-plans the reminders when the session is moved; a moment that is already past is dropped', async () => {
    const { member, session } = await bookMonday();
    await db.sql("update public.sessions set start_time = '09:00', end_time = '10:00' where id = $1", [session]);
    expect(await jobs(member.userId, 'training_reminder')).toMatchObject([{ status: 'pending', scheduled_for: '2026-11-01T07:00:00Z' }]);

    // The session is moved to start in 3 hours: both reminder moments are in the past -> dropped.
    await db.setNow('2026-11-02T05:00:00Z');
    await db.sql("update public.sessions set start_time = '10:00', end_time = '11:00' where id = $1", [session]);
    expect((await jobs(member.userId)).filter((j) => j.status === 'pending')).toHaveLength(0);
  });
});

describe('reminder delivery (worker)', () => {
  it('writes the in-app reminder only when it falls due, with the exact text, and never twice', async () => {
    const { member } = await bookMonday();
    expect(await claim()).toHaveLength(0);

    await db.setNow('2026-11-01T04:59:59Z'); // one second before
    expect(await claim()).toHaveLength(0);
    expect((await notificationsOf(member)).map((n) => n.type)).toEqual(['booking_confirmed']);

    await db.setNow(REMINDER_24H); // exactly on time
    expect(await claim()).toHaveLength(0); // no Push subscription -> nothing to deliver, but the record exists
    const list = await notificationsOf(member);
    expect(list.map((n) => n.type)).toEqual(['booking_confirmed', 'training_reminder']);
    expect(list[1]).toMatchObject({
      title: 'מחר נפגשות על המגרש',
      message: 'מחר בשעה 07:00 מחכה לך אימון פאדל. נתראה!',
      destination_url: '/bookings',
    });

    await claim();
    await db.setNow('2026-11-01T05:30:00Z');
    await claim();
    expect((await notificationsOf(member)).filter((n) => n.type === 'training_reminder')).toHaveLength(1);
  });

  it('cancellation-deadline reminder has the exact text and is sent one hour before the deadline', async () => {
    const { member } = await bookMonday();
    await db.setNow(REMINDER_DEADLINE);
    await claim();
    const n = (await notificationsOf(member)).find((x) => x.type === 'cancellation_deadline');
    expect(n).toMatchObject({
      title: 'תזכורת לגבי האימון שלך',
      message: 'אם לא תוכלי להגיע לאימון של מחר, נשארה לך שעה לבטל בלי שהאימון ייחשב במכסה שלך.',
    });
  });

  it('does not send a reminder once its moment has passed (down-time of the dispatcher)', async () => {
    const { member } = await bookMonday();
    await db.setNow('2026-11-01T21:00:01Z'); // 1h after the deadline reminder, after the deadline
    expect(await claim()).toHaveLength(0);
    expect((await notificationsOf(member)).map((n) => n.type)).not.toContain('cancellation_deadline');
    expect(await jobs(member.userId, 'cancellation_deadline')).toMatchObject([{ status: 'skipped' }]);

    // The 24h reminder is sent up to 2h late, never later.
    expect((await notificationsOf(member)).map((n) => n.type)).not.toContain('training_reminder');
  });

  it('a cancelled booking never gets a reminder (withdrawn at cancel time AND re-checked at delivery)', async () => {
    const { member, bookingId } = await bookMonday();
    await db.setNow('2026-11-01T03:00:00Z');
    await member.cancel(bookingId);
    expect((await jobs(member.userId)).filter((j) => j.status === 'pending')).toHaveLength(0);

    // Even if a job were still pending (e.g. a stale row), delivery re-validates the booking.
    await db.sql("update public.notification_jobs set status = 'pending' where user_id = $1", [member.userId]);
    await db.setNow(REMINDER_24H);
    await claim();
    expect((await notificationsOf(member)).map((n) => n.type)).toEqual(['booking_confirmed']);
  });

  it('never reminds for a session the coach cancelled', async () => {
    const admin = await db.createAdmin();
    const { member, session } = await bookMonday();
    await admin.rpc('admin_cancel_session', { p_session_id: session, p_reason: 'גשם' });
    await db.setNow(REMINDER_24H);
    await claim();
    expect((await notificationsOf(member)).map((n) => n.type).sort()).toEqual(['booking_confirmed', 'session_cancelled']);
  });

  it('returns the Push work (all devices of the user) and the link, then waits for the outcome', async () => {
    const { member } = await bookMonday();
    const s1 = await addSubscription(member.userId, 'phone');
    const s2 = await addSubscription(member.userId, 'tablet');
    await db.setNow(REMINDER_24H);
    const work = await claim();
    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({ type: 'training_reminder', title: 'מחר נפגשות על המגרש', url: '/bookings' });
    expect(work[0].subscriptions.map((s) => s.id).sort()).toEqual([s1, s2].sort());
    // A claimed job is locked: a second dispatcher run gets nothing.
    expect(await claim()).toHaveLength(0);
    expect(await complete(work[0].job_id, { delivered: [s1, s2] })).toBe('done');
    expect(await claim()).toHaveLength(0);
  });
});

describe('Push delivery outcomes', () => {
  async function pendingPushJob() {
    const { member } = await bookMonday();
    const s1 = await addSubscription(member.userId, 'a');
    const s2 = await addSubscription(member.userId, 'b');
    await db.setNow(REMINDER_24H);
    const [job] = await claim();
    return { member, s1, s2, job };
  }

  it('retries only the devices that failed, with back-off, and never contacts the delivered ones again', async () => {
    const { s1, s2, job } = await pendingPushJob();
    expect(await complete(job.job_id, { delivered: [s1], retry: [s2], error: 'HTTP 503' })).toBe('retry');
    expect(await claim()).toHaveLength(0); // back-off: not before next_attempt_at

    await db.setNow('2026-11-01T05:01:00Z'); // 30s back-off elapsed
    const retry = await claim();
    expect(retry).toHaveLength(1);
    expect(retry[0].subscriptions.map((s) => s.id)).toEqual([s2]);
  });

  it('gives up after 5 attempts', async () => {
    const { s2, job } = await pendingPushJob();
    let current = job;
    let minutes = 0;
    for (let attempt = 1; attempt < 5; attempt++) {
      expect(await complete(current.job_id, { retry: [s2], error: 'HTTP 503' })).toBe('retry');
      minutes += 40;
      await db.setNow(new Date(Date.parse(REMINDER_24H) + minutes * 60_000).toISOString());
      const next = await claim();
      expect(next).toHaveLength(1);
      current = next[0];
    }
    expect(await complete(current.job_id, { retry: [s2], error: 'HTTP 503' })).toBe('failed');
    const [row] = await db.sql<{ status: string; attempts: number }>('select status, attempts from public.notification_jobs where id = $1', [current.job_id]).then((r) => r.rows);
    expect(row).toEqual({ status: 'failed', attempts: 5 });
  });

  it('removes expired subscriptions (404/410) and completes the job', async () => {
    const { s1, s2, job } = await pendingPushJob();
    expect(await complete(job.job_id, { gone: [s1], delivered: [s2] })).toBe('done');
    const left = await db.sql<{ id: string }>('select id from public.push_subscriptions where id in ($1, $2)', [s1, s2]);
    expect(left.rows.map((r) => r.id)).toEqual([s2]);
  });

  it('a crashed dispatcher (lock expired) is retried, but not forever', async () => {
    const { member } = await bookMonday();
    await addSubscription(member.userId);
    await db.setNow(REMINDER_24H);
    expect(await claim()).toHaveLength(1); // attempt 1, never completed
    expect(await claim()).toHaveLength(0);
    await db.setNow('2026-11-01T05:04:00Z'); // lock (3 min) expired
    expect(await claim()).toHaveLength(1); // attempt 2
  });

  it('completing an unknown / already finished job is ignored', async () => {
    expect(await complete(randomUUID())).toBe('ignored');
    const { job } = await pendingPushJob();
    await complete(job.job_id);
    expect(await complete(job.job_id)).toBe('ignored');
  });
});

describe('concurrent dispatchers', () => {
  it('never hand the same job to two workers', async () => {
    const session = await db.createSession({ date: MONDAY, capacity: 30 });
    for (let i = 0; i < 12; i++) {
      const m = await db.createMember({ limit: 4 });
      await addSubscription(m.userId);
      await m.book(session);
    }
    await db.setNow(REMINDER_24H);
    const runs = await Promise.all(Array.from({ length: 6 }, () => claim(100)));
    const ids = runs.flat().map((w) => w.job_id);
    expect(ids.length).toBe(24); // 12 confirmations + 12 reminders... (confirmations are due since they were created at BASE_NOW)
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('coach cancels a session', () => {
  it('notifies exactly the trainees whose booking was cancelled by it, once each', async () => {
    const admin = await db.createAdmin();
    const session = await db.createSession({ date: MONDAY, capacity: 6 });
    const a = await db.createMember();
    const b = await db.createMember();
    const left = await db.createMember();
    const bystander = await db.createMember();
    const a1 = await a.book(session);
    await b.book(session);
    const leftBooking = await left.book(session);
    await left.cancel(leftBooking); // cancelled early by herself before

    await addSubscription(a.userId);
    await admin.rpc('admin_cancel_session', { p_session_id: session, p_reason: 'גשם' });

    for (const m of [a, b]) {
      const n = (await notificationsOf(m)).filter((x) => x.type === 'session_cancelled');
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({
        title: 'האימון שלך בוטל',
        message: 'האימון שתוכנן ליום שני בשעה 07:00 בוטל. האימון לא ייחשב במכסת האימונים שלך.',
        destination_url: '/bookings',
      });
    }
    expect((await notificationsOf(left)).map((x) => x.type)).not.toContain('session_cancelled');
    expect(await notificationsOf(bystander)).toHaveLength(0);

    // Push job only for the one who has a device; the in-app record exists for both regardless.
    expect(await jobs(a.userId, 'session_cancelled')).toHaveLength(1);
    expect(await jobs(b.userId, 'session_cancelled')).toHaveLength(0);

    // Cancelling again changes nothing (no duplicates).
    await admin.rpc('admin_cancel_session', { p_session_id: session });
    expect((await notificationsOf(a)).filter((x) => x.type === 'session_cancelled')).toHaveLength(1);

    // Allowance logic untouched: the coach-cancelled booking does not count.
    expect(await a.allowance('2026-11-01')).toMatchObject({ used: 0 });
    expect(a1).toBeTruthy();
  });

  it('removing one trainee from a session does not claim that the session was cancelled', async () => {
    const admin = await db.createAdmin();
    const session = await db.createSession({ date: MONDAY });
    const a = await db.createMember();
    const bookingId = await a.book(session);
    await admin.rpc('admin_set_booking_status', { p_booking_id: bookingId, p_status: 'CANCELLED_BY_COACH' });
    expect((await notificationsOf(a)).map((n) => n.type)).toEqual(['booking_confirmed']);
  });

  it('records the notification even when Push is switched off', async () => {
    const admin = await db.createAdmin();
    const session = await db.createSession({ date: MONDAY });
    const a = await db.createMember();
    await a.book(session);
    await addSubscription(a.userId);
    await a.rpc('save_notification_preferences', { p_push_enabled: false });
    await admin.rpc('admin_cancel_session', { p_session_id: session });
    expect((await notificationsOf(a)).map((n) => n.type)).toContain('session_cancelled');
    expect(await jobs(a.userId, 'session_cancelled')).toHaveLength(0);
  });
});

describe('weekly schedule published', () => {
  async function draftNextWeek(count = 2) {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(await db.createSession({ date: `2026-11-0${3 + i}`, start: '07:00', status: 'DRAFT' }));
    }
    return ids;
  }

  it('announces an upcoming week once to approved trainees, with a link to that week', async () => {
    const admin = await db.createAdmin();
    const a = await db.createMember();
    const b = await db.createMember({ limit: null });
    const pending = await db.createMember({ approved: false });
    const inactive = await db.createMember();
    await db.sql("update public.profiles set approval_status = 'inactive' where id = $1", [inactive.userId]);

    const drafts = await draftNextWeek();
    expect(await notificationsOf(a)).toHaveLength(0); // drafts are never announced

    await admin.rpc('admin_publish_sessions', { p_session_ids: drafts });
    for (const m of [a, b]) {
      const list = await notificationsOf(m);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        type: 'schedule_published',
        title: 'האימונים לשבוע הבא נפתחו',
        message: 'מערכת האימונים החדשה מחכה לך. זה הזמן לבחור מתי נפגשות על המגרש.',
        destination_url: `/schedule?week=${NEXT_WEEK}`,
      });
    }
    expect(await notificationsOf(pending)).toHaveLength(0);
    expect(await notificationsOf(inactive)).toHaveLength(0);
    expect((await notificationsOf(admin)).map((n) => n.type)).not.toContain('schedule_published');
  });

  it('does not announce again when more sessions of the same week are published or published sessions are edited', async () => {
    const admin = await db.createAdmin();
    const a = await db.createMember();
    const [d1, d2] = await draftNextWeek();
    await admin.rpc('admin_publish_sessions', { p_session_ids: [d1] });
    await admin.rpc('admin_publish_sessions', { p_session_ids: [d1, d2] });
    await db.sql("update public.sessions set notes = 'עדכון', capacity = 5 where id = $1", [d1]);
    await db.sql("update public.sessions set status = 'DRAFT' where id = $1", [d2]);
    await admin.rpc('admin_publish_sessions', { p_session_ids: [d2] });
    expect((await notificationsOf(a)).filter((n) => n.type === 'schedule_published')).toHaveLength(1);
  });

  it('does not announce the current week (already open) nor a week with no newly published session', async () => {
    const admin = await db.createAdmin();
    const a = await db.createMember();
    const draft = await db.createSession({ date: '2026-10-30', status: 'DRAFT' }); // this week (Fri)
    await admin.rpc('admin_publish_sessions', { p_session_ids: [draft] });
    expect(await notificationsOf(a)).toHaveLength(0);
    expect(THIS_WEEK).toBe('2026-10-25');
  });

  it('respects the weekly-announcement preference', async () => {
    const admin = await db.createAdmin();
    const off = await db.createMember();
    const on = await db.createMember();
    await off.rpc('save_notification_preferences', { p_weekly_schedule: false });
    const drafts = await draftNextWeek(1);
    await admin.rpc('admin_publish_sessions', { p_session_ids: drafts });
    expect(await notificationsOf(off)).toHaveLength(0);
    expect(await notificationsOf(on)).toHaveLength(1);
  });

  it('queues Push only for trainees with a device', async () => {
    const admin = await db.createAdmin();
    const withPush = await db.createMember();
    const without = await db.createMember();
    await addSubscription(withPush.userId);
    await admin.rpc('admin_publish_sessions', { p_session_ids: await draftNextWeek(1) });
    expect(await jobs(withPush.userId, 'schedule_published')).toHaveLength(1);
    expect(await jobs(without.userId, 'schedule_published')).toHaveLength(0);
    const work = await claim();
    expect(work.find((w) => w.user_id === withPush.userId)).toMatchObject({ url: `/schedule?week=${NEXT_WEEK}` });
  });
});

describe('preferences', () => {
  it('switching reminders off stops them (no in-app record, no Push); other types are unaffected', async () => {
    const { member } = await bookMonday();
    await addSubscription(member.userId);
    await member.rpc('save_notification_preferences', { p_training_reminders: false });
    await db.setNow(REMINDER_24H);
    await claim();
    expect((await notificationsOf(member)).map((n) => n.type)).toEqual(['booking_confirmed']);
    await db.setNow(REMINDER_DEADLINE);
    const work = await claim();
    expect(work.map((w) => w.title)).toEqual(['תזכורת לגבי האימון שלך']);
  });

  it('booking updates off: the in-app record is kept, the Push is not sent', async () => {
    const member = await db.createMember();
    await addSubscription(member.userId);
    await member.rpc('save_notification_preferences', { p_booking_updates: false });
    const session = await db.createSession({ date: MONDAY });
    await member.book(session);
    expect(await notificationsOf(member)).toHaveLength(1);
    expect(await jobs(member.userId, 'booking_confirmed')).toHaveLength(0);
  });

  it('master Push switch off: reminders are still recorded in-app but no Push work is returned', async () => {
    const { member } = await bookMonday();
    await addSubscription(member.userId);
    await member.rpc('save_notification_preferences', { p_push_enabled: false });
    await db.setNow(REMINDER_24H);
    const work = await claim();
    expect(work.filter((w) => w.user_id === member.userId)).toHaveLength(0);
    expect((await notificationsOf(member)).map((n) => n.type)).toContain('training_reminder');
  });

  it('are private and default to everything on', async () => {
    const a = await db.createMember();
    const b = await db.createMember();
    expect((await a.query('select * from public.notification_preferences')).rowCount).toBe(0);
    await a.rpc('save_notification_preferences', { p_weekly_schedule: false });
    const own = await a.query<{ weekly_schedule: boolean; booking_updates: boolean; push_enabled: boolean }>('select * from public.notification_preferences');
    expect(own.rows).toMatchObject([{ weekly_schedule: false, booking_updates: true, push_enabled: true }]);
    expect((await b.query('select * from public.notification_preferences')).rowCount).toBe(0);
    await expect(a.query('update public.notification_preferences set weekly_schedule = true')).rejects.toThrow(/permission denied/);
  });

  it('pending trainees cannot save preferences', async () => {
    const pending = await db.createMember({ approved: false });
    await expect(pending.rpc('save_notification_preferences', { p_push_enabled: true })).rejects.toMatchObject(code('NOT_AUTHORIZED'));
  });
});

describe('push subscriptions', () => {
  const sub = (tag: string) => ({
    p_endpoint: `https://fcm.example.test/send/${tag}`,
    p_p256dh: 'BPublicKey',
    p_auth: 'authSecret',
    p_user_agent: 'Mozilla/5.0',
  });

  it('keeps several devices per user, stores them idempotently and lets the user remove one', async () => {
    const m = await db.createMember();
    await m.rpc('save_push_subscription', sub('phone'));
    await m.rpc('save_push_subscription', sub('phone'));
    await m.rpc('save_push_subscription', sub('tablet'));
    expect((await m.query('select id from public.push_subscriptions')).rowCount).toBe(2);
    await m.rpc('delete_push_subscription', { p_endpoint: sub('phone').p_endpoint });
    expect((await m.query('select id from public.push_subscriptions')).rowCount).toBe(1);
  });

  it('saving a subscription switches the master Push preference on', async () => {
    const m = await db.createMember();
    await m.rpc('save_notification_preferences', { p_push_enabled: false });
    await m.rpc('save_push_subscription', sub('x'));
    const r = await m.query<{ push_enabled: boolean }>('select push_enabled from public.notification_preferences');
    expect(r.rows[0].push_enabled).toBe(true);
  });

  it('is private: no other user can read or delete it, and the keys are never readable through the API', async () => {
    const a = await db.createMember();
    const b = await db.createMember();
    await a.rpc('save_push_subscription', sub('private'));
    expect((await b.query('select id from public.push_subscriptions')).rowCount).toBe(0);
    await b.rpc('delete_push_subscription', { p_endpoint: sub('private').p_endpoint });
    expect((await a.query('select id from public.push_subscriptions')).rowCount).toBe(1);
    await expect(a.query('select p256dh from public.push_subscriptions')).rejects.toThrow(/permission denied/);
    await expect(a.query('select auth from public.push_subscriptions')).rejects.toThrow(/permission denied/);
    await expect(a.query('select * from public.push_subscriptions')).rejects.toThrow(/permission denied/);
    await expect(a.query("insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://x.test/1234567890123456789', 'k', 'a')", [a.userId])).rejects.toThrow(/permission denied/);
  });

  it('rejects malformed subscriptions, pending users and caps the device count', async () => {
    const m = await db.createMember();
    await expect(m.rpc('save_push_subscription', { ...sub('x'), p_endpoint: 'http://insecure.test/x' })).rejects.toMatchObject(code('INVALID_INPUT'));
    await expect(m.rpc('save_push_subscription', { ...sub('x'), p_auth: '' })).rejects.toMatchObject(code('INVALID_INPUT'));
    const pending = await db.createMember({ approved: false });
    await expect(pending.rpc('save_push_subscription', sub('p'))).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    for (let i = 0; i < 13; i++) await m.rpc('save_push_subscription', sub(`device-${i}`));
    expect((await m.query('select id from public.push_subscriptions')).rowCount).toBe(10);
  });
});

describe('notification center: read state, privacy and permissions', () => {
  it('marks one / all as read, only for the owner', async () => {
    const { member } = await bookMonday();
    const other = await db.createMember();
    const s2 = await db.createSession({ date: '2026-11-03' });
    await member.book(s2);
    const [first] = await notificationsOf(member);

    // someone else cannot mark it
    await other.rpc('mark_notification_read', { p_id: first.id });
    expect((await notificationsOf(member)).filter((n) => n.read_at)).toHaveLength(0);

    await member.rpc('mark_notification_read', { p_id: first.id });
    const afterOne = await notificationsOf(member);
    expect(afterOne.filter((n) => n.read_at)).toHaveLength(1);
    const stamp = String(afterOne.find((n) => n.id === first.id)!.read_at);
    await db.setNow('2026-10-29T08:00:00Z');
    await member.rpc('mark_notification_read', { p_id: first.id }); // idempotent: keeps the first time
    expect(String((await notificationsOf(member)).find((n) => n.id === first.id)!.read_at)).toBe(stamp);

    expect(await member.call<number>('mark_all_notifications_read')).toBe(1);
    expect((await notificationsOf(member)).every((n) => n.read_at)).toBe(true);
    expect(await member.call<number>('mark_all_notifications_read')).toBe(0);
  });

  it('a user sees only her own notifications', async () => {
    const { member } = await bookMonday();
    const other = await db.createMember();
    expect(await notificationsOf(other)).toHaveLength(0);
    expect(await notificationsOf(member)).toHaveLength(1);
    const admin = await db.createAdmin();
    expect(await notificationsOf(admin)).toHaveLength(0);
  });

  it('clients cannot create, edit or delete notifications, nor reach the outbox or the system functions', async () => {
    const { member } = await bookMonday();
    const victim = await db.createMember();
    await expect(
      member.query("insert into public.notifications (user_id, type, title, message, dedupe_key) values ($1, 'booking_confirmed', 'x', 'y', 'k')", [victim.userId]),
    ).rejects.toThrow(/permission denied/);
    await expect(member.query("update public.notifications set title = 'hacked'")).rejects.toThrow(/permission denied/);
    await expect(member.query("update public.notifications set read_at = null")).rejects.toThrow(/permission denied/);
    await expect(member.query('delete from public.notifications')).rejects.toThrow(/permission denied/);
    await expect(member.query('select * from public.notification_jobs')).rejects.toThrow(/permission denied/);
    await expect(member.query('select * from public.notification_worker_config')).rejects.toThrow(/permission denied/);
    await expect(member.query('select * from public.notification_broadcasts')).rejects.toThrow(/permission denied/);
    await expect(
      member.query("select public.notif_create_now($1, 'booking_confirmed', 't', 'm', null, null, null, 'k')", [victim.userId]),
    ).rejects.toThrow(/permission denied/);
    await expect(member.query('select public.schedule_booking_reminders($1)', [randomUUID()])).rejects.toThrow(/permission denied/);
    await expect(member.query('select public.worker_claim_jobs($1, 10)', [SECRET])).rejects.toThrow(/permission denied/);
    expect(await notificationsOf(victim)).toHaveLength(0);
  });

  it('rejects an unsafe destination url at the database level', async () => {
    const m = await db.createMember();
    for (const url of ['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/a b']) {
      await expect(
        db.sql("insert into public.notifications (user_id, type, title, message, destination_url, dedupe_key) values ($1, 'booking_confirmed', 't', 'm', $2, $3)", [m.userId, url, randomUUID()]),
      ).rejects.toThrow(/destination_url/);
    }
    for (const url of ['/', '/bookings', `/schedule?week=${NEXT_WEEK}`]) {
      await db.sql("insert into public.notifications (user_id, type, title, message, destination_url, dedupe_key) values ($1, 'booking_confirmed', 't', 'm', $2, $3)", [m.userId, url, randomUUID()]);
    }
  });
});

describe('dispatcher authorisation', () => {
  it('refuses a missing, short or wrong secret (also for anonymous API callers)', async () => {
    await expect(claim(10, 'wrong-secret-wrong-secret-wrong-secret-xx')).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    await expect(claim(10, 'short')).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    await expect(asAnon('select public.worker_claim_jobs($1, 10)', ['nope'.repeat(12)])).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    await expect(asAnon('select public.worker_complete_job($1, $2, null, null, null, null)', ['nope'.repeat(12), randomUUID()])).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    await expect(asAnon('select * from public.notification_jobs')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select * from public.notifications')).rejects.toThrow(/permission denied/);
  });

  it('accepts the configured secret from the anonymous API role', async () => {
    const r = await asAnon<{ r: unknown[] }>('select public.worker_claim_jobs($1, 10) as r', [SECRET]);
    expect(Array.isArray(r.rows[0].r)).toBe(true);
  });

  it('is locked until a secret is configured', async () => {
    await db.sql('delete from public.notification_worker_config');
    try {
      await expect(claim()).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    } finally {
      await db.sql('insert into public.notification_worker_config (secret_sha256) values ($1)', [createHash('sha256').update(SECRET).digest('hex')]);
    }
  });
});
