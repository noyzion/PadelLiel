import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BASE_NOW, THIS_WEEK, TestDb } from './support/harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});
afterEach(async () => {
  await db.setNow(BASE_NOW);
});

const code = (c: string) => expect.objectContaining({ message: c });

/**
 * Session used by most tests: Monday 2026-11-02 07:00 Israel time.
 * Israel is UTC+2 in November (DST ended 2026-10-25) -> starts_at = 2026-11-02T05:00:00Z.
 * The 8h deadline is therefore 2026-11-01T21:00:00Z (= Sunday 23:00 local).
 */
const MONDAY = '2026-11-02';
const DEADLINE = '2026-11-01T21:00:00Z';

async function bookedMondaySession(limit = 2) {
  const member = await db.createMember({ limit });
  const session = await db.createSession({ date: MONDAY, start: '07:00', end: '08:00' });
  const bookingId = await member.book(session);
  return { member, session, bookingId };
}

describe('generated timestamps', () => {
  it('stores session instants in Asia/Jerusalem (winter)', async () => {
    const session = await db.createSession({ date: MONDAY, start: '07:00', end: '08:00' });
    const r = await db.sql<{ s: string; e: string; w: string }>(
      "select to_char(starts_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') s, to_char(ends_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') e, week_start::text w from public.sessions where id = $1",
      [session],
    );
    expect(r.rows[0]).toEqual({ s: '2026-11-02T05:00:00Z', e: '2026-11-02T06:00:00Z', w: '2026-11-01' });
  });

  it('stores session instants in Asia/Jerusalem (summer, UTC+3)', async () => {
    const session = await db.createSession({ date: '2026-07-06', start: '07:00', end: '08:00' });
    const r = await db.sql<{ s: string }>(
      "select to_char(starts_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') s from public.sessions where id = $1",
      [session],
    );
    expect(r.rows[0].s).toBe('2026-07-06T04:00:00Z');
  });
});

describe('early cancellation (>= 8h before start)', () => {
  it('cancels, frees the spot and restores the weekly allowance', async () => {
    const { member, session, bookingId } = await bookedMondaySession(1);
    await db.setNow('2026-11-01T18:00:00Z'); // Sunday 20:00 local — 11h before
    const result = await member.cancel(bookingId);
    expect(result).toMatchObject({ status: 'CANCELLED_EARLY', allowance_restored: true });
    expect(await db.bookingStatus(bookingId)).toBe('CANCELLED_EARLY');
    expect(await db.occupied(session)).toBe(0);
    expect(await member.allowance('2026-11-01')).toMatchObject({ used: 0, remaining: 1 });

    // she can use the freed allowance on a different session
    const other = await db.createSession({ date: '2026-11-03', start: '07:00' });
    await expect(member.book(other)).resolves.toBeTruthy();
  });

  it('cancellation exactly at the 8h deadline is EARLY', async () => {
    const { member, bookingId } = await bookedMondaySession();
    await db.setNow(DEADLINE);
    const result = await member.cancel(bookingId);
    expect(result.status).toBe('CANCELLED_EARLY');
    expect(new Date(result.cancellation_deadline).toISOString()).toBe('2026-11-01T21:00:00.000Z');
  });
});

describe('late cancellation (< 8h before start)', () => {
  it('one second after the deadline is LATE and requires explicit confirmation', async () => {
    const { member, bookingId } = await bookedMondaySession();
    await db.setNow('2026-11-01T21:00:01Z');
    await expect(member.cancel(bookingId)).rejects.toMatchObject(code('LATE_CANCELLATION_CONFIRMATION_REQUIRED'));
    expect(await db.bookingStatus(bookingId)).toBe('CONFIRMED'); // nothing changed

    const result = await member.cancel(bookingId, true);
    expect(result).toMatchObject({ status: 'CANCELLED_LATE', allowance_restored: false });
  });

  it('frees the spot but keeps counting toward the weekly allowance', async () => {
    const { member, session, bookingId } = await bookedMondaySession(1);
    await db.setNow('2026-11-02T00:00:00Z'); // Monday 02:00 local — 5h before
    await member.cancel(bookingId, true);
    expect(await db.occupied(session)).toBe(0);
    expect(await member.allowance('2026-11-01')).toMatchObject({ used: 1, remaining: 0 });

    const other = await db.createSession({ date: '2026-11-03', start: '07:00' });
    await expect(member.book(other)).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));

    // another trainee can take the freed spot
    const someoneElse = await db.createMember();
    await expect(someoneElse.book(session, true)).resolves.toBeTruthy();
  });

  it('cannot cancel after the session started', async () => {
    const { member, bookingId } = await bookedMondaySession();
    await db.setNow('2026-11-02T05:00:00Z');
    await expect(member.cancel(bookingId, true)).rejects.toMatchObject(code('SESSION_STARTED'));
  });

  it('cannot cancel an already cancelled booking, or someone else\'s booking', async () => {
    const { member, bookingId } = await bookedMondaySession();
    const stranger = await db.createMember();
    await expect(stranger.cancel(bookingId)).rejects.toMatchObject(code('BOOKING_NOT_FOUND'));
    await member.cancel(bookingId);
    await expect(member.cancel(bookingId)).rejects.toMatchObject(code('INVALID_BOOKING_STATE'));
  });
});

describe('daylight saving time', () => {
  it('uses an absolute 8h window when clocks go BACK (Sun 2026-10-25)', async () => {
    // 01:00-02:00 local happens twice that night. Session Sun 07:00 local = 05:00Z (UTC+2).
    // 8h before is 21:00Z Saturday = 00:00 local Sunday (still UTC+3), NOT 23:00 wall-clock.
    const member = await db.createMember();
    const session = await db.createSession({ date: '2026-10-25', start: '07:00', end: '08:00' });
    await db.setNow('2026-10-24T12:00:00Z');
    const bookingId = await member.book(session);
    await db.setNow('2026-10-24T21:00:00Z');
    const res = await member.cancel(bookingId);
    expect(res.status).toBe('CANCELLED_EARLY');

    const second = await db.createMember();
    await db.setNow('2026-10-24T12:00:00Z');
    const b2 = await second.book(session);
    await db.setNow('2026-10-24T21:00:01Z');
    await expect(second.cancel(b2)).rejects.toMatchObject(code('LATE_CANCELLATION_CONFIRMATION_REQUIRED'));
  });

  it('uses an absolute 8h window when clocks go FORWARD (Fri 2026-03-27)', async () => {
    // Clocks jump 02:00 -> 03:00 on Friday. Session Fri 07:00 local = 04:00Z (UTC+3).
    // Deadline = 20:00Z Thursday = 22:00 local Thursday (UTC+2) — only 7 wall-clock hours before 07:00? No: 9h of wall clock, 8h real.
    const member = await db.createMember({ startsOn: '2026-01-01' });
    const session = await db.createSession({ date: '2026-03-27', start: '07:00', end: '08:00' });
    await db.setNow('2026-03-26T08:00:00Z');
    const bookingId = await member.book(session);
    await db.setNow('2026-03-26T20:00:00Z');
    expect((await member.cancel(bookingId)).status).toBe('CANCELLED_EARLY');

    const other = await db.createMember({ startsOn: '2026-01-01' });
    await db.setNow('2026-03-26T08:00:00Z');
    const b2 = await other.book(session);
    await db.setNow('2026-03-26T20:00:01Z');
    await expect(other.cancel(b2)).rejects.toMatchObject(code('LATE_CANCELLATION_CONFIRMATION_REQUIRED'));
  });

  it('keeps week assignment independent of DST (week of Sun 2026-03-22 contains Fri 03-27)', async () => {
    const r = await db.sql<{ w: string }>(
      `insert into public.sessions (session_date, start_time, end_time, skill_level_code, status)
       values ('2026-03-27','07:00','08:00','beginner','PUBLISHED') returning week_start::text as w`,
    );
    expect(r.rows[0].w).toBe('2026-03-22');
  });
});

describe('last-minute booking (< 8h before start)', () => {
  it('requires acknowledging that cancelling will still count', async () => {
    const member = await db.createMember();
    const session = await db.createSession({ date: MONDAY, start: '07:00', end: '08:00' });
    await db.setNow('2026-11-02T00:00:00Z');
    await expect(member.book(session)).rejects.toMatchObject(code('LATE_POLICY_ACK_REQUIRED'));
    expect(await db.occupied(session)).toBe(0);
    await expect(member.book(session, true)).resolves.toBeTruthy();
  });

  it('is flagged on the schedule so the UI can ask before booking', async () => {
    const member = await db.createMember();
    await db.createSession({ date: MONDAY, start: '07:00', end: '08:00' });
    await db.setNow('2026-11-02T00:00:00Z');
    const rows = await member.rpc<{ is_late_window: boolean }>('get_week_schedule', { p_week_start: '2026-11-01' });
    expect(rows[0].is_late_window).toBe(true);
    await db.setNow('2026-10-30T00:00:00Z');
    const earlier = await member.rpc<{ is_late_window: boolean }>('get_week_schedule', { p_week_start: '2026-11-01' });
    expect(earlier[0].is_late_window).toBe(false);
  });

  it('a booking made 7h before start that is cancelled right away is a LATE cancellation', async () => {
    const member = await db.createMember({ limit: 1 });
    const session = await db.createSession({ date: MONDAY, start: '07:00', end: '08:00' });
    await db.setNow('2026-11-01T22:00:00Z');
    const id = await member.book(session, true);
    const res = await member.cancel(id, true);
    expect(res.status).toBe('CANCELLED_LATE');
    expect(await member.allowance('2026-11-01')).toMatchObject({ used: 1, remaining: 0 });
  });
});

describe('cancellation setting', () => {
  it('honours a changed cutoff', async () => {
    const admin = await db.createAdmin();
    await admin.query("update public.app_settings set value = '2'::jsonb where key = 'cancellation_cutoff_hours'");
    try {
      const { member, bookingId } = await bookedMondaySession();
      await db.setNow('2026-11-02T01:00:00Z'); // 4h before: early with a 2h cutoff
      expect((await member.cancel(bookingId)).status).toBe('CANCELLED_EARLY');
    } finally {
      await admin.query("update public.app_settings set value = '8'::jsonb where key = 'cancellation_cutoff_hours'");
    }
  });

  it('rejects out-of-range cutoff values', async () => {
    await expect(
      db.sql("update public.app_settings set value = '-1'::jsonb where key = 'cancellation_cutoff_hours'"),
    ).rejects.toThrow();
  });
});

describe('no-show', () => {
  it('admin can mark a no-show only after the start; it counts toward the allowance', async () => {
    const admin = await db.createAdmin();
    const { member, bookingId } = await bookedMondaySession(1);
    await expect(
      admin.call('admin_set_booking_status', { p_booking_id: bookingId, p_status: 'NO_SHOW' }),
    ).rejects.toMatchObject(code('ATTENDANCE_BEFORE_START'));

    await db.setNow('2026-11-02T06:30:00Z');
    await admin.call('admin_set_booking_status', { p_booking_id: bookingId, p_status: 'NO_SHOW' });
    expect(await db.bookingStatus(bookingId)).toBe('NO_SHOW');
    expect(await member.allowance('2026-11-01')).toMatchObject({ used: 1, remaining: 0 });

    // correction: she did attend
    await admin.call('admin_set_booking_status', { p_booking_id: bookingId, p_status: 'ATTENDED' });
    expect(await db.bookingStatus(bookingId)).toBe('ATTENDED');
    expect((await member.allowance('2026-11-01')).used).toBe(1);
  });

  it('trainees cannot change statuses and cancelled history is immutable', async () => {
    const admin = await db.createAdmin();
    const { member, bookingId } = await bookedMondaySession();
    await expect(
      member.call('admin_set_booking_status', { p_booking_id: bookingId, p_status: 'ATTENDED' }),
    ).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    await member.cancel(bookingId);
    await expect(
      admin.call('admin_set_booking_status', { p_booking_id: bookingId, p_status: 'CONFIRMED' }),
    ).rejects.toMatchObject(code('INVALID_STATUS_TRANSITION'));
  });

  it('admin removing a trainee uses CANCELLED_BY_COACH and does not consume allowance', async () => {
    const admin = await db.createAdmin();
    const { member, session, bookingId } = await bookedMondaySession(1);
    await admin.call('admin_set_booking_status', { p_booking_id: bookingId, p_status: 'CANCELLED_BY_COACH' });
    expect(await db.occupied(session)).toBe(0);
    expect(await member.allowance('2026-11-01')).toMatchObject({ used: 0, remaining: 1 });
  });
});

describe('coach cancels a session', () => {
  it('cancels all bookings, consumes no allowance and blocks new bookings', async () => {
    const admin = await db.createAdmin();
    const session = await db.createSession({ date: MONDAY, start: '09:00', end: '10:00' });
    const a = await db.createMember({ limit: 1 });
    const b = await db.createMember({ limit: 1 });
    const late = await db.createMember({ limit: 1 });
    const ba = await a.book(session);
    const bb = await b.book(session);

    await admin.call('admin_cancel_session', { p_session_id: session, p_reason: 'Rain' });

    expect(await db.bookingStatus(ba)).toBe('CANCELLED_BY_COACH');
    expect(await db.bookingStatus(bb)).toBe('CANCELLED_BY_COACH');
    expect(await a.allowance('2026-11-01')).toMatchObject({ used: 0, remaining: 1 });
    await expect(late.book(session)).rejects.toMatchObject(code('SESSION_NOT_PUBLISHED'));
    const row = await db.sql('select status, cancel_reason from public.sessions where id = $1', [session]);
    expect(row.rows[0]).toMatchObject({ status: 'CANCELLED', cancel_reason: 'Rain' });

    // she can use her allowance elsewhere
    const other = await db.createSession({ date: '2026-11-03', start: '09:00', end: '10:00' });
    await expect(a.book(other)).resolves.toBeTruthy();
  });

  it('a previously late-cancelled booking stops counting when the coach cancels the session', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 1 });
    const session = await db.createSession({ date: MONDAY, start: '11:00', end: '12:00' });
    const id = await member.book(session);
    await db.setNow('2026-11-02T06:00:00Z'); // 4h before 11:00 local (09:00Z)
    await member.cancel(id, true);
    expect((await member.allowance('2026-11-01')).used).toBe(1);
    await admin.call('admin_cancel_session', { p_session_id: session });
    expect((await member.allowance('2026-11-01')).used).toBe(0);
    expect(await db.bookingStatus(id)).toBe('CANCELLED_LATE'); // history is preserved
  });

  it('cannot be performed by a trainee, and is idempotent for admins', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const session = await db.createSession({ date: MONDAY, start: '13:00', end: '14:00' });
    await expect(member.call('admin_cancel_session', { p_session_id: session })).rejects.toMatchObject(code('NOT_AUTHORIZED'));
    await admin.call('admin_cancel_session', { p_session_id: session });
    await expect(admin.call('admin_cancel_session', { p_session_id: session })).resolves.not.toThrow();
  });

  it('a direct status update cannot cancel a session that still has confirmed bookings', async () => {
    const member = await db.createMember();
    const session = await db.createSession({ date: MONDAY, start: '15:00', end: '16:00' });
    await member.book(session);
    await expect(db.sql("update public.sessions set status = 'CANCELLED' where id = $1", [session])).rejects.toMatchObject(
      code('SESSION_HAS_BOOKINGS'),
    );
  });
});

void THIS_WEEK;
