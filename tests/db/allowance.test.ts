import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASE_NOW, NEXT_MONTH, THIS_MONTH, TestDb } from './support/harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});

const code = (c: string) => expect.objectContaining({ message: c });

describe('default plans', () => {
  it('seeds the three plans with 4 / 8 / 13 sessions per month', async () => {
    const r = await db.sql<{ name: string; monthly_session_limit: number }>(
      `select name, monthly_session_limit from public.subscription_plans
       where name in ('פעם בשבוע', 'פעמיים בשבוע', 'שלוש פעמים בשבוע') order by monthly_session_limit`,
    );
    expect(r.rows).toEqual([
      { name: 'פעם בשבוע', monthly_session_limit: 4 },
      { name: 'פעמיים בשבוע', monthly_session_limit: 8 },
      { name: 'שלוש פעמים בשבוע', monthly_session_limit: 13 },
    ]);
  });
});

describe('monthly allowance', () => {
  it('counts reserved sessions and blocks booking beyond the plan limit (2/month)', async () => {
    const member = await db.createMember({ limit: 2 });
    const sun = await db.createSession({ date: '2026-11-01' });
    const tue = await db.createSession({ date: '2026-11-03' });
    const wed = await db.createSession({ date: '2026-11-04' });

    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ month_start: NEXT_MONTH, effective_limit: 2, used: 0, remaining: 2 });
    await member.book(sun);
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ used: 1, remaining: 1 });
    await member.book(tue);
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ used: 2, remaining: 0 });
    await expect(member.book(wed)).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));
  });

  it('has no per-week cap: an 8-session plan can put all sessions in the same week, but never a 9th in the month', async () => {
    const member = await db.createMember({ limit: 8 });
    // Sun 1.11 .. Sat 7.11 at 07:00, plus a second slot on Sunday = 8 sessions in ONE week.
    const days = ['01', '02', '03', '04', '05', '06', '07'].map((d) => `2026-11-${d}`);
    for (const date of days) await member.book(await db.createSession({ date }));
    await member.book(await db.createSession({ date: '2026-11-01', start: '09:00', end: '10:00' }));
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ plan_limit: 8, used: 8, remaining: 0 });

    // The 9th session of the month is blocked even though it is in a different week...
    const ninth = await db.createSession({ date: '2026-11-20' });
    await expect(member.book(ninth)).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));
    // ...while the next month starts fresh.
    const december = await db.createSession({ date: '2026-12-02' });
    await expect(member.book(december)).resolves.toBeTruthy();
  });

  it('attributes usage to the month of the session, not the booking date', async () => {
    const member = await db.createMember({ limit: 1 });
    const thisMonthSession = await db.createSession({ date: '2026-10-30', start: '07:00' }); // Friday, this month
    const nextMonthSession = await db.createSession({ date: '2026-11-02', start: '07:00' }); // next month

    await member.book(nextMonthSession); // booked today, used in NEXT month
    expect(await member.allowance(THIS_MONTH)).toMatchObject({ used: 0, remaining: 1 });
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ used: 1, remaining: 0 });
    await expect(member.book(thisMonthSession)).resolves.toBeTruthy(); // this month still free
  });

  it('month boundaries follow Asia/Jerusalem dates: 30.11 belongs to November, 1.12 starts December', async () => {
    const member = await db.createMember({ limit: 1 });
    const lastOfNov = await db.createSession({ date: '2026-11-30', start: '20:00', end: '21:00' });
    const firstOfDec = await db.createSession({ date: '2026-12-01', start: '00:00', end: '01:00' });
    await member.book(lastOfNov);
    // 1.12 00:00 local is a different month, so it is still bookable.
    await expect(member.book(firstOfDec)).resolves.toBeTruthy();
    expect(await member.allowance('2026-11-01')).toMatchObject({ used: 1 });
    expect(await member.allowance('2026-12-01')).toMatchObject({ used: 1 });
  });

  it('month_start_of is the first day of the month for any date', async () => {
    const r = await db.sql<{ ws: string }>(
      `select public.month_start_of(d)::text as ws
       from unnest(array['2026-11-01','2026-11-15','2026-11-30','2026-12-01','2028-02-29']::date[]) with ordinality t(d, i)
       order by i`,
    );
    expect(r.rows.map((x) => x.ws)).toEqual(['2026-11-01', '2026-11-01', '2026-11-01', '2026-12-01', '2028-02-01']);
  });

  it('sessions.month_start is generated from the session date', async () => {
    const id = await db.createSession({ date: '2026-12-31' });
    const r = await db.sql<{ m: string }>('select month_start::text m from public.sessions where id = $1', [id]);
    expect(r.rows[0].m).toBe('2026-12-01');
  });

  it('monthly usage resets automatically: next month is independent', async () => {
    const member = await db.createMember({ limit: 1 });
    const a = await db.createSession({ date: '2026-11-15' });
    const b = await db.createSession({ date: '2026-12-15' });
    await member.book(a);
    await expect(member.book(b)).resolves.toBeTruthy();
  });

  it('past months stay available as history after the clock moves forward', async () => {
    const member = await db.createMember({ limit: 1 });
    const session = await db.createSession({ date: '2026-12-01' });
    await member.book(session);
    await db.setNow('2026-12-20T10:00:00Z');
    try {
      expect(await member.allowance('2026-12-01')).toMatchObject({ used: 1, effective_limit: 1, remaining: 0 });
      expect(await member.allowance('2026-11-01')).toMatchObject({ used: 0, remaining: 1 });
      expect(await member.allowance('2027-01-01')).toMatchObject({ used: 0, remaining: 1 });
    } finally {
      await db.setNow(BASE_NOW);
    }
  });

  it('counts each booking once across status transitions', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 3 });
    const session = await db.createSession({ date: '2026-10-26', start: '07:00' }); // already started (now = Thu 29.10)
    // booking in the past is impossible via RPC, so insert fixture directly
    const b = await db.sql<{ id: string }>(
      "insert into public.bookings (session_id, member_id, status) values ($1,$2,'CONFIRMED') returning id",
      [session, member.userId],
    );
    const id = b.rows[0].id;
    expect((await member.allowance(THIS_MONTH)).used).toBe(1);
    await admin.call('admin_set_booking_status', { p_booking_id: id, p_status: 'ATTENDED' });
    expect((await member.allowance(THIS_MONTH)).used).toBe(1);
    await admin.call('admin_set_booking_status', { p_booking_id: id, p_status: 'NO_SHOW' });
    expect((await member.allowance(THIS_MONTH)).used).toBe(1);
  });
});

describe('cancellation vs. the monthly quota (8-hour policy)', () => {
  it('a cancellation inside the 8-hour window still consumes one session of the monthly quota', async () => {
    const member = await db.createMember({ limit: 1 });
    const session = await db.createSession({ date: '2026-11-10', start: '07:00' }); // starts 05:00Z, deadline 21:00Z on the 9th
    const other = await db.createSession({ date: '2026-11-24', start: '07:00' });
    await db.setNow('2026-11-09T22:00:00Z');
    try {
      const bookingId = await member.book(session, true);
      const result = await member.cancel(bookingId, true);
      expect(result).toMatchObject({ status: 'CANCELLED_LATE', allowance_restored: false });
      expect(await member.allowance(NEXT_MONTH)).toMatchObject({ used: 1, remaining: 0 });
      await expect(member.book(other, true)).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));
    } finally {
      await db.setNow(BASE_NOW);
    }
  });

  it('an early cancellation gives the session back to the monthly quota', async () => {
    const member = await db.createMember({ limit: 1 });
    const session = await db.createSession({ date: '2026-11-10', start: '07:00' });
    const other = await db.createSession({ date: '2026-11-24', start: '07:00' });
    const bookingId = await member.book(session);
    expect(await member.cancel(bookingId)).toMatchObject({ status: 'CANCELLED_EARLY', allowance_restored: true });
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ used: 0, remaining: 1 });
    await expect(member.book(other)).resolves.toBeTruthy();
  });
});

describe('subscription changes', () => {
  it('mid-month plan change keeps consumed sessions counted and applies the new limit going forward', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 1, startsOn: '2026-10-01' });
    const fri = await db.createSession({ date: '2026-10-30', start: '07:00' });
    const sat = await db.createSession({ date: '2026-10-31', start: '07:00' });
    await member.book(fri);
    await expect(member.book(sat)).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));

    const plan3 = await db.planIdForLimit(3);
    await admin.call('admin_assign_subscription', { p_member_id: member.userId, p_plan_id: plan3 }); // starts today

    expect(await member.allowance(THIS_MONTH)).toMatchObject({ plan_limit: 3, used: 1, remaining: 2 });
    await expect(member.book(sat)).resolves.toBeTruthy();

    // Old subscription is preserved as history and closed the day before.
    const subs = await db.sql(
      'select is_active, starts_on::text, ends_on::text from public.member_subscriptions where member_id = $1 order by starts_on',
      [member.userId],
    );
    expect(subs.rows).toEqual([
      { is_active: false, starts_on: '2026-10-01', ends_on: '2026-10-28' },
      { is_active: true, starts_on: '2026-10-29', ends_on: null },
    ]);
  });

  it('downgrading never restores or removes consumed sessions', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 3, startsOn: '2026-10-01' });
    const a = await db.createSession({ date: '2026-11-10', start: '07:00' });
    const b = await db.createSession({ date: '2026-11-11', start: '07:00' });
    await member.book(a);
    await member.book(b);
    await admin.call('admin_assign_subscription', {
      p_member_id: member.userId,
      p_plan_id: await db.planIdForLimit(1),
      p_starts_on: '2026-11-01',
    });
    expect(await member.allowance('2026-11-01')).toMatchObject({ plan_limit: 1, used: 2, remaining: 0 });
  });

  it('deactivating a subscription blocks booking, reactivating allows it again', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 2 });
    const subId = (await db.sql('select id from public.member_subscriptions where member_id = $1', [member.userId])).rows[0].id;
    const session = await db.createSession({ date: '2026-11-12' });
    await admin.call('admin_set_subscription_active', { p_subscription_id: subId, p_active: false });
    await expect(member.book(session)).rejects.toMatchObject(code('NO_ACTIVE_SUBSCRIPTION'));
    expect((await member.allowance(NEXT_MONTH)).has_active_subscription).toBe(false);
    await admin.call('admin_set_subscription_active', { p_subscription_id: subId, p_active: true });
    await expect(member.book(session)).resolves.toBeTruthy();
  });

  it('refuses to activate a second subscription for the same member', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 1 });
    const oldId = (await db.sql('select id from public.member_subscriptions where member_id = $1', [member.userId])).rows[0].id;
    await admin.call('admin_assign_subscription', { p_member_id: member.userId, p_plan_id: await db.planIdForLimit(2), p_starts_on: '2026-11-02' });
    await expect(
      admin.call('admin_set_subscription_active', { p_subscription_id: oldId, p_active: true }),
    ).rejects.toMatchObject(code('ANOTHER_SUBSCRIPTION_ACTIVE'));
  });

  it('allows same-day correction of an assigned plan', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: null });
    await admin.call('admin_assign_subscription', { p_member_id: member.userId, p_plan_id: await db.planIdForLimit(1) });
    await admin.call('admin_assign_subscription', { p_member_id: member.userId, p_plan_id: await db.planIdForLimit(3) });
    expect(await member.allowance(THIS_MONTH)).toMatchObject({ plan_limit: 3 });
  });

  it('a plan scheduled for a future start keeps the current plan in force until then', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 2, startsOn: '2026-10-01' });
    const thisMonth = await db.createSession({ date: '2026-10-30', start: '07:00' });
    const nextMonth = await db.createSession({ date: '2026-11-03', start: '07:00' });

    await admin.call('admin_assign_subscription', {
      p_member_id: member.userId,
      p_plan_id: await db.planIdForLimit(3),
      p_starts_on: '2026-11-01',
    });

    // The old plan still covers the rest of this month: booking works and the numbers are the old plan's.
    expect(await member.allowance(THIS_MONTH)).toMatchObject({ plan_limit: 2, has_active_subscription: true });
    await expect(member.book(thisMonth)).resolves.toBeTruthy();
    expect(await member.allowance(THIS_MONTH)).toMatchObject({ plan_limit: 2, used: 1, remaining: 1 });

    // From the 1st the new plan applies.
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ plan_limit: 3, has_active_subscription: true });
    await expect(member.book(nextMonth)).resolves.toBeTruthy();

    // The replaced row is history (closed the day before) but marked as replaced, not switched off.
    const subs = await db.sql(
      'select is_active, superseded, starts_on::text, ends_on::text from public.member_subscriptions where member_id = $1 order by starts_on',
      [member.userId],
    );
    expect(subs.rows).toEqual([
      { is_active: false, superseded: true, starts_on: '2026-10-01', ends_on: '2026-10-31' },
      { is_active: true, superseded: false, starts_on: '2026-11-01', ends_on: null },
    ]);
  });

  it('switching a replaced subscription off by hand still blocks booking for the dates it covers', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 2, startsOn: '2026-10-01' });
    const session = await db.createSession({ date: '2026-10-30', start: '07:00' });
    await admin.call('admin_assign_subscription', {
      p_member_id: member.userId,
      p_plan_id: await db.planIdForLimit(3),
      p_starts_on: '2026-11-01',
    });
    const oldId = (
      await db.sql('select id from public.member_subscriptions where member_id = $1 and starts_on = $2', [member.userId, '2026-10-01'])
    ).rows[0].id;

    await admin.call('admin_set_subscription_active', { p_subscription_id: oldId, p_active: false });
    expect((await member.allowance(THIS_MONTH)).has_active_subscription).toBe(false);
    await expect(member.book(session)).rejects.toMatchObject(code('NO_ACTIVE_SUBSCRIPTION'));
  });
});

describe('allowance adjustments', () => {
  it('restores one late-cancelled session exactly once, with an audit trail and no status rewriting', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 1 });
    const session = await db.createSession({ date: '2026-10-30', start: '07:00' });
    // Session starts 05:00Z on 30 Oct; the deadline was 21:00Z on 29 Oct, so we are inside the late window.
    await db.setNow('2026-10-29T22:00:00Z');
    const bookingId = await member.book(session, true);
    await member.cancel(bookingId, true);
    expect(await db.bookingStatus(bookingId)).toBe('CANCELLED_LATE');
    expect(await member.allowance(THIS_MONTH)).toMatchObject({ used: 1, remaining: 0 });

    await admin.call('admin_restore_allowance', { p_booking_id: bookingId, p_reason: 'Medical note' });
    expect(await member.allowance(THIS_MONTH)).toMatchObject({ used: 1, adjustments: 1, effective_limit: 2, remaining: 1 });
    expect(await db.bookingStatus(bookingId)).toBe('CANCELLED_LATE'); // history untouched

    await expect(
      admin.call('admin_restore_allowance', { p_booking_id: bookingId, p_reason: 'again' }),
    ).rejects.toMatchObject(code('ADJUSTMENT_ALREADY_APPLIED'));

    const audit = await db.sql("select action from public.audit_logs where action = 'insert:allowance_adjustments'");
    expect(audit.rowCount).toBe(1);
    await db.setNow(BASE_NOW);
  });

  it('requires a reason and an admin; manual adjustments change only that month', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 1 });
    await expect(
      admin.call('admin_adjust_allowance', { p_member_id: member.userId, p_month_start: NEXT_MONTH, p_delta: 1, p_reason: '  ' }),
    ).rejects.toMatchObject(code('INVALID_INPUT'));
    await expect(
      member.call('admin_adjust_allowance', { p_member_id: member.userId, p_month_start: NEXT_MONTH, p_delta: 5, p_reason: 'x' }),
    ).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    await expect(
      admin.call('admin_adjust_allowance', { p_member_id: member.userId, p_month_start: NEXT_MONTH, p_delta: 32, p_reason: 'too many' }),
    ).rejects.toMatchObject(code('INVALID_INPUT'));

    await admin.call('admin_adjust_allowance', {
      p_member_id: member.userId,
      p_month_start: '2026-11-18', // mid-month: normalised to the first day of that month
      p_delta: 1,
      p_reason: 'Make-up session',
    });
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ adjustments: 1, effective_limit: 2, remaining: 2 });
    expect(await member.allowance('2026-12-01')).toMatchObject({ adjustments: 0, effective_limit: 1 });
    const a = await db.sql('select month_start::text from public.allowance_adjustments where member_id = $1', [member.userId]);
    expect(a.rows[0].month_start).toBe(NEXT_MONTH);
  });

  it('only allows restoring late cancellations or no-shows', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const session = await db.createSession({ date: '2026-11-20' });
    const bookingId = await member.book(session);
    await expect(
      admin.call('admin_restore_allowance', { p_booking_id: bookingId, p_reason: 'nope' }),
    ).rejects.toMatchObject(code('INVALID_BOOKING_STATE'));
  });
});

describe('monthly usage history', () => {
  it('summarises months with late cancellations and no-shows', async () => {
    const member = await db.createMember({ limit: 2 });
    const admin = await db.createAdmin();
    const s1 = await db.createSession({ date: '2026-10-26', start: '07:00' });
    const s2 = await db.createSession({ date: '2026-10-27', start: '07:00' });
    await db.sql("insert into public.bookings (session_id, member_id, status) values ($1,$2,'NO_SHOW')", [s1, member.userId]);
    await db.sql("insert into public.bookings (session_id, member_id, status) values ($1,$2,'CANCELLED_LATE')", [s2, member.userId]);

    const rows = await admin.rpc<{ month_start: string; used: number; no_shows: number; late_cancellations: number }>(
      'get_member_monthly_usage',
      { p_member_id: member.userId, p_from_month: '2026-09-01', p_to_month: THIS_MONTH },
    );
    expect(rows.map((r) => r.month_start)).toEqual([THIS_MONTH, '2026-09-01']);
    expect(rows[0]).toMatchObject({ used: 2, no_shows: 1, late_cancellations: 1 });
    expect(rows[1]).toMatchObject({ used: 0 });
  });

  it('rejects absurd ranges', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    await expect(
      admin.rpc('get_member_monthly_usage', { p_member_id: member.userId, p_from_month: '2020-01-01', p_to_month: THIS_MONTH }),
    ).rejects.toMatchObject(code('INVALID_INPUT'));
  });
});

describe('session integrity with monthly quota', () => {
  it('a session with a counted booking cannot be moved into another month (even inside the same week)', async () => {
    const member = await db.createMember({ limit: 4 });
    // Thu 31.12.2026 and Fri 1.1.2027 are in the same Sunday-based week but different months.
    const session = await db.createSession({ date: '2026-12-31' });
    await member.book(session);
    await expect(db.sql("update public.sessions set session_date = '2027-01-01' where id = $1", [session])).rejects.toMatchObject(
      code('SESSION_MONTH_CHANGE_NOT_ALLOWED'),
    );
    // Moving inside the month is fine.
    await expect(db.sql("update public.sessions set session_date = '2026-12-30' where id = $1", [session])).resolves.toBeTruthy();
  });
});
