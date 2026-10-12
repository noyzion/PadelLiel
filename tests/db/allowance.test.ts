import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASE_NOW, NEXT_WEEK, THIS_WEEK, TestDb } from './support/harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});

const code = (c: string) => expect.objectContaining({ message: c });

describe('weekly allowance', () => {
  it('counts reserved sessions and blocks booking beyond the plan limit (2/week)', async () => {
    const member = await db.createMember({ limit: 2 });
    const sun = await db.createSession({ date: '2026-11-01' });
    const tue = await db.createSession({ date: '2026-11-03' });
    const wed = await db.createSession({ date: '2026-11-04' });

    expect(await member.allowance(NEXT_WEEK)).toMatchObject({ effective_limit: 2, used: 0, remaining: 2 });
    await member.book(sun);
    expect(await member.allowance(NEXT_WEEK)).toMatchObject({ used: 1, remaining: 1 });
    await member.book(tue);
    expect(await member.allowance(NEXT_WEEK)).toMatchObject({ used: 2, remaining: 0 });
    await expect(member.book(wed)).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));
  });

  it('attributes usage to the week of the session, not the booking date', async () => {
    const member = await db.createMember({ limit: 1 });
    const thisWeekSession = await db.createSession({ date: '2026-10-30', start: '07:00' }); // Friday, this week
    const nextWeekSession = await db.createSession({ date: '2026-11-02', start: '07:00' }); // next week

    await member.book(nextWeekSession); // booked today, used in NEXT week
    expect(await member.allowance(THIS_WEEK)).toMatchObject({ used: 0, remaining: 1 });
    expect(await member.allowance(NEXT_WEEK)).toMatchObject({ used: 1, remaining: 0 });
    await expect(member.book(thisWeekSession)).resolves.toBeTruthy(); // this week still free
  });

  it('week boundaries: Saturday belongs to the old week, Sunday starts a new one (Asia/Jerusalem)', async () => {
    const member = await db.createMember({ limit: 1 });
    const saturday = await db.createSession({ date: '2026-11-07', start: '20:00', end: '21:00' });
    const sunday = await db.createSession({ date: '2026-11-08', start: '00:00', end: '01:00' });
    await member.book(saturday);
    // Sunday 00:00 local is a different week, so it is still bookable.
    await expect(member.book(sunday)).resolves.toBeTruthy();
    expect(await member.allowance('2026-11-01')).toMatchObject({ used: 1 });
    expect(await member.allowance('2026-11-08')).toMatchObject({ used: 1 });
  });

  it('week_start is Sunday-based for any day of the week', async () => {
    const r = await db.sql<{ d: string; ws: string }>(
      `select d::text as d, public.week_start_of(d)::text as ws
       from unnest(array['2026-11-01','2026-11-02','2026-11-07','2026-11-08']::date[]) d`,
    );
    expect(r.rows.map((x) => x.ws)).toEqual(['2026-11-01', '2026-11-01', '2026-11-01', '2026-11-08']);
  });

  it('weekly usage resets automatically: next week is independent', async () => {
    const member = await db.createMember({ limit: 1 });
    const a = await db.createSession({ date: '2026-11-15' });
    const b = await db.createSession({ date: '2026-11-22' });
    await member.book(a);
    await expect(member.book(b)).resolves.toBeTruthy();
  });

  it('past weeks stay available as history after the clock moves forward', async () => {
    const member = await db.createMember({ limit: 1 });
    const session = await db.createSession({ date: '2026-12-01' });
    await member.book(session);
    await db.setNow('2026-12-20T10:00:00Z');
    try {
      expect(await member.allowance('2026-11-29')).toMatchObject({ used: 1, effective_limit: 1, remaining: 0 });
      expect(await member.allowance('2026-12-13')).toMatchObject({ used: 0, remaining: 1 });
    } finally {
      await db.setNow(BASE_NOW);
    }
  });

  it('counts each booking once across status transitions', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 3 });
    const session = await db.createSession({ date: '2026-10-26', start: '07:00' }); // already started? now=Thu 29 -> yes
    // booking in the past is impossible via RPC, so insert fixture directly
    const b = await db.sql<{ id: string }>(
      "insert into public.bookings (session_id, member_id, status) values ($1,$2,'CONFIRMED') returning id",
      [session, member.userId],
    );
    const id = b.rows[0].id;
    expect((await member.allowance(THIS_WEEK)).used).toBe(1);
    await admin.call('admin_set_booking_status', { p_booking_id: id, p_status: 'ATTENDED' });
    expect((await member.allowance(THIS_WEEK)).used).toBe(1);
    await admin.call('admin_set_booking_status', { p_booking_id: id, p_status: 'NO_SHOW' });
    expect((await member.allowance(THIS_WEEK)).used).toBe(1);
  });
});

describe('subscription changes', () => {
  it('mid-week plan change keeps consumed sessions counted and applies the new limit going forward', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 1, startsOn: '2026-10-01' });
    const fri = await db.createSession({ date: '2026-10-30', start: '07:00' });
    const sat = await db.createSession({ date: '2026-10-31', start: '07:00' });
    await member.book(fri);
    await expect(member.book(sat)).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));

    const plan3 = await db.planIdForLimit(3);
    await admin.call('admin_assign_subscription', { p_member_id: member.userId, p_plan_id: plan3 }); // starts today

    expect(await member.allowance(THIS_WEEK)).toMatchObject({ plan_limit: 3, used: 1, remaining: 2 });
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
      p_starts_on: '2026-11-08',
    });
    expect(await member.allowance('2026-11-08')).toMatchObject({ plan_limit: 1, used: 2, remaining: 0 });
  });

  it('deactivating a subscription blocks booking, reactivating allows it again', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 2 });
    const subId = (await db.sql('select id from public.member_subscriptions where member_id = $1', [member.userId])).rows[0].id;
    const session = await db.createSession({ date: '2026-11-12' });
    await admin.call('admin_set_subscription_active', { p_subscription_id: subId, p_active: false });
    await expect(member.book(session)).rejects.toMatchObject(code('NO_ACTIVE_SUBSCRIPTION'));
    expect((await member.allowance(NEXT_WEEK)).has_active_subscription).toBe(false);
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
    expect(await member.allowance(THIS_WEEK)).toMatchObject({ plan_limit: 3 });
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
    expect(await member.allowance(THIS_WEEK)).toMatchObject({ used: 1, remaining: 0 });

    await admin.call('admin_restore_allowance', { p_booking_id: bookingId, p_reason: 'Medical note' });
    expect(await member.allowance(THIS_WEEK)).toMatchObject({ used: 1, adjustments: 1, effective_limit: 2, remaining: 1 });
    expect(await db.bookingStatus(bookingId)).toBe('CANCELLED_LATE'); // history untouched

    await expect(
      admin.call('admin_restore_allowance', { p_booking_id: bookingId, p_reason: 'again' }),
    ).rejects.toMatchObject(code('ADJUSTMENT_ALREADY_APPLIED'));

    const audit = await db.sql("select action from public.audit_logs where action = 'insert:allowance_adjustments'");
    expect(audit.rowCount).toBe(1);
    await db.setNow(BASE_NOW);
  });

  it('requires a reason and an admin; manual adjustments change only that week', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 1 });
    await expect(
      admin.call('admin_adjust_allowance', { p_member_id: member.userId, p_week_start: NEXT_WEEK, p_delta: 1, p_reason: '  ' }),
    ).rejects.toMatchObject(code('INVALID_INPUT'));
    await expect(
      member.call('admin_adjust_allowance', { p_member_id: member.userId, p_week_start: NEXT_WEEK, p_delta: 5, p_reason: 'x' }),
    ).rejects.toMatchObject(code('NOT_AUTHORIZED'));

    await admin.call('admin_adjust_allowance', {
      p_member_id: member.userId,
      p_week_start: '2026-11-04', // a Wednesday: normalised to the Sunday of that week
      p_delta: 1,
      p_reason: 'Make-up session',
    });
    expect(await member.allowance(NEXT_WEEK)).toMatchObject({ adjustments: 1, effective_limit: 2, remaining: 2 });
    expect(await member.allowance('2026-11-08')).toMatchObject({ adjustments: 0, effective_limit: 1 });
    const a = await db.sql('select week_start::text from public.allowance_adjustments where member_id = $1', [member.userId]);
    expect(a.rows[0].week_start).toBe(NEXT_WEEK);
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

describe('weekly usage history', () => {
  it('summarises weeks with late cancellations and no-shows', async () => {
    const member = await db.createMember({ limit: 2 });
    const admin = await db.createAdmin();
    const s1 = await db.createSession({ date: '2026-10-26', start: '07:00' });
    const s2 = await db.createSession({ date: '2026-10-27', start: '07:00' });
    const b1 = (await db.sql("insert into public.bookings (session_id, member_id, status) values ($1,$2,'NO_SHOW') returning id", [s1, member.userId])).rows[0].id;
    await db.sql("insert into public.bookings (session_id, member_id, status) values ($1,$2,'CANCELLED_LATE')", [s2, member.userId]);
    void b1;

    const rows = await admin.rpc<{ week_start: string; used: number; no_shows: number; late_cancellations: number }>(
      'get_member_weekly_usage',
      { p_member_id: member.userId, p_from_week: '2026-10-18', p_to_week: THIS_WEEK },
    );
    expect(rows.map((r) => r.week_start)).toEqual([THIS_WEEK, '2026-10-18']);
    expect(rows[0]).toMatchObject({ used: 2, no_shows: 1, late_cancellations: 1 });
    expect(rows[1]).toMatchObject({ used: 0 });
  });
});
