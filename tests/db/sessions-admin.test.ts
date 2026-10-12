import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestDb } from './support/harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});

const code = (c: string) => expect.objectContaining({ message: c });

describe('publishing and drafts', () => {
  it('publishes drafts in bulk and makes them bookable', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const a = await db.createSession({ date: '2026-11-03', status: 'DRAFT' });
    const b = await db.createSession({ date: '2026-11-04', status: 'DRAFT' });
    await expect(member.book(a)).rejects.toMatchObject(code('SESSION_NOT_PUBLISHED'));

    const count = await admin.call<number>('admin_publish_sessions', { p_session_ids: [a, b] });
    expect(count).toBe(2);
    await expect(member.book(a)).resolves.toBeTruthy();
    // publishing again changes nothing
    expect(await admin.call<number>('admin_publish_sessions', { p_session_ids: [a, b] })).toBe(0);
  });

  it('trainees cannot publish', async () => {
    const member = await db.createMember();
    const a = await db.createSession({ date: '2026-11-03', start: '12:00', end: '13:00', status: 'DRAFT' });
    await expect(member.call('admin_publish_sessions', { p_session_ids: [a] })).rejects.toMatchObject(code('NOT_AUTHORIZED'));
  });

  it('a published session with bookings cannot go back to draft', async () => {
    const member = await db.createMember();
    const s = await db.createSession({ date: '2026-11-03', start: '14:00', end: '15:00' });
    await member.book(s);
    await expect(db.sql("update public.sessions set status = 'DRAFT' where id = $1", [s])).rejects.toMatchObject(code('SESSION_HAS_BOOKINGS'));
  });

  it('sessions with booking history cannot be deleted', async () => {
    const member = await db.createMember();
    const s = await db.createSession({ date: '2026-11-03', start: '15:00', end: '16:00' });
    await member.book(s);
    await expect(db.sql('delete from public.sessions where id = $1', [s])).rejects.toMatchObject({ code: '23001' });
  });
});

describe('duplicating a week', () => {
  it('copies non-cancelled sessions to the target week as drafts and is idempotent', async () => {
    const admin = await db.createAdmin();
    await db.createSession({ date: '2026-12-06', start: '07:00', end: '08:00', level: 'beginner', capacity: 3 });
    await db.createSession({ date: '2026-12-08', start: '08:00', end: '09:00', level: 'advanced' });
    await db.createSession({ date: '2026-12-09', start: '08:00', end: '09:00', status: 'CANCELLED' });

    const n = await admin.call<number>('admin_duplicate_week', { p_from_week: '2026-12-06', p_to_week: '2026-12-13' });
    expect(n).toBe(2);
    const rows = await db.sql(
      "select session_date::text d, start_time::text t, skill_level_code l, capacity c, status from public.sessions where week_start = '2026-12-13' order by session_date",
    );
    expect(rows.rows).toEqual([
      { d: '2026-12-13', t: '07:00:00', l: 'beginner', c: 3, status: 'DRAFT' },
      { d: '2026-12-15', t: '08:00:00', l: 'advanced', c: 4, status: 'DRAFT' },
    ]);
    expect(await admin.call<number>('admin_duplicate_week', { p_from_week: '2026-12-06', p_to_week: '2026-12-13' })).toBe(0);
  });

  it('rejects duplicating a week onto itself', async () => {
    const admin = await db.createAdmin();
    await expect(
      admin.call('admin_duplicate_week', { p_from_week: '2026-12-06', p_to_week: '2026-12-09' }),
    ).rejects.toMatchObject(code('INVALID_INPUT'));
  });
});

describe('changing a session after bookings exist', () => {
  it('allows moving within the same week when nobody collides', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const s = await db.createSession({ date: '2026-11-03', start: '07:00', end: '08:00' });
    await member.book(s);
    await admin.query("update public.sessions set start_time = '09:00', end_time = '10:00' where id = $1", [s]);
    const r = await db.sql("select to_char(starts_at at time zone 'UTC','HH24:MI') t from public.sessions where id = $1", [s]);
    expect(r.rows[0].t).toBe('07:00'); // 09:00 Israel (UTC+2) = 07:00Z - generated column follows the change
  });

  it('refuses to move a booked session into another week', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const s = await db.createSession({ date: '2026-11-03', start: '11:00', end: '12:00' });
    await member.book(s);
    await expect(
      admin.query("update public.sessions set session_date = '2026-11-10' where id = $1", [s]),
    ).rejects.toMatchObject(code('SESSION_WEEK_CHANGE_NOT_ALLOWED'));
  });

  it("refuses a new time that collides with a booked member's other booking", async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 3 });
    const a = await db.createSession({ date: '2026-11-04', start: '07:00', end: '08:00' });
    const b = await db.createSession({ date: '2026-11-04', start: '09:00', end: '10:00' });
    await member.book(a);
    await member.book(b);
    await expect(
      admin.query("update public.sessions set start_time = '07:30', end_time = '08:30' where id = $1", [b]),
    ).rejects.toMatchObject(code('OVERLAPPING_BOOKING'));
  });

  it('refuses to lower capacity below the current occupancy, allows raising it', async () => {
    const admin = await db.createAdmin();
    const s = await db.createSession({ date: '2026-11-05', capacity: 3 });
    const members = await Promise.all([db.createMember(), db.createMember()]);
    for (const m of members) await m.book(s);
    await expect(admin.query('update public.sessions set capacity = 1 where id = $1', [s])).rejects.toMatchObject(code('CAPACITY_BELOW_OCCUPANCY'));
    await admin.query('update public.sessions set capacity = 2 where id = $1', [s]);
    await admin.query('update public.sessions set capacity = 6 where id = $1', [s]);
  });

  it('closing registration stops trainees but still lets the admin assign (capacity permitting)', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const other = await db.createMember();
    const s = await db.createSession({ date: '2026-11-05', start: '12:00', end: '13:00' });
    await admin.query('update public.sessions set registration_open = false where id = $1', [s]);
    await expect(member.book(s)).rejects.toMatchObject(code('REGISTRATION_CLOSED'));
    await expect(admin.call('admin_assign_booking', { p_session_id: s, p_member_id: other.userId })).resolves.toBeTruthy();
  });

  it('cancelled and completed sessions are final', async () => {
    const admin = await db.createAdmin();
    const s = await db.createSession({ date: '2026-11-05', start: '15:00', end: '16:00' });
    await admin.call('admin_cancel_session', { p_session_id: s });
    await expect(admin.query("update public.sessions set status = 'PUBLISHED' where id = $1", [s])).rejects.toMatchObject(code('INVALID_INPUT'));
  });
});

describe('subscriptions history & audit', () => {
  it('assigning a plan keeps the previous subscription as history', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: null });
    await admin.call('admin_assign_subscription', { p_member_id: member.userId, p_plan_id: await db.planIdForLimit(1), p_starts_on: '2026-10-01' });
    await admin.call('admin_assign_subscription', { p_member_id: member.userId, p_plan_id: await db.planIdForLimit(2), p_starts_on: '2026-11-01', p_ends_on: '2026-12-31' });
    const rows = await db.sql(
      'select is_active, starts_on::text s, ends_on::text e from public.member_subscriptions where member_id = $1 order by starts_on',
      [member.userId],
    );
    expect(rows.rows).toEqual([
      { is_active: false, s: '2026-10-01', e: '2026-10-31' },
      { is_active: true, s: '2026-11-01', e: '2026-12-31' },
    ]);
  });

  it('rejects invalid validity ranges and unknown plans', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: null });
    await expect(
      admin.call('admin_assign_subscription', { p_member_id: member.userId, p_plan_id: await db.planIdForLimit(1), p_starts_on: '2026-11-10', p_ends_on: '2026-11-01' }),
    ).rejects.toMatchObject(code('INVALID_INPUT'));
    await expect(
      admin.call('admin_assign_subscription', { p_member_id: member.userId, p_plan_id: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toMatchObject(code('PLAN_NOT_FOUND'));
  });

  it('records admin session changes with the acting admin in the audit log', async () => {
    const admin = await db.createAdmin();
    const res = await admin.query<{ id: string }>(
      "insert into public.sessions (session_date, start_time, end_time, skill_level_code) values ('2026-12-20','07:00','08:00','beginner') returning id",
    );
    const log = await db.sql("select actor_id, action from public.audit_logs where entity_type = 'sessions' and entity_id = $1", [res.rows[0].id]);
    expect(log.rows).toEqual([{ actor_id: admin.userId, action: 'insert:sessions' }]);
  });

  it('exposes the member bookings list with server-computed cancellation info', async () => {
    const member = await db.createMember();
    const s = await db.createSession({ date: '2026-11-05', start: '17:00', end: '18:00' });
    const id = await member.book(s);
    const rows = await member.rpc<{ booking_id: string; can_cancel: boolean; is_late_window: boolean; counts_toward_allowance: boolean }>('get_my_bookings');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ booking_id: id, can_cancel: true, is_late_window: false, counts_toward_allowance: true });
  });
});
