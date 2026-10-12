import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NEXT_WEEK, TestDb } from './support/harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});

const code = (c: string) => expect.objectContaining({ message: c });

describe('booking preconditions', () => {
  it('books an eligible session and records a CONFIRMED booking', async () => {
    const member = await db.createMember();
    const session = await db.createSession({ date: '2026-11-02' });
    const bookingId = await member.book(session);
    expect(await db.bookingStatus(bookingId)).toBe('CONFIRMED');
    expect(await db.occupied(session)).toBe(1);
  });

  it('rejects unauthenticated callers', async () => {
    const session = await db.createSession({ date: '2026-11-02' });
    await expect(db.pool.query('select public.book_session($1)', [session])).rejects.toThrow();
  });

  it('rejects members that are not approved', async () => {
    const member = await db.createMember({ approved: false });
    const session = await db.createSession({ date: '2026-11-02' });
    await expect(member.book(session)).rejects.toMatchObject(code('MEMBER_NOT_APPROVED'));
  });

  it('rejects members without a subscription', async () => {
    const member = await db.createMember({ limit: null });
    const session = await db.createSession({ date: '2026-11-02' });
    await expect(member.book(session)).rejects.toMatchObject(code('NO_ACTIVE_SUBSCRIPTION'));
  });

  it('rejects members with a deactivated subscription', async () => {
    const member = await db.createMember({ subscriptionActive: false });
    const session = await db.createSession({ date: '2026-11-02' });
    await expect(member.book(session)).rejects.toMatchObject(code('NO_ACTIVE_SUBSCRIPTION'));
  });

  it('rejects when the subscription has expired before the session date', async () => {
    const member = await db.createMember({ endsOn: '2026-11-01' });
    const session = await db.createSession({ date: '2026-11-02' });
    await expect(member.book(session)).rejects.toMatchObject(code('NO_ACTIVE_SUBSCRIPTION'));
  });

  it('rejects when the subscription starts after the session date', async () => {
    const member = await db.createMember({ startsOn: '2026-11-03' });
    const session = await db.createSession({ date: '2026-11-02' });
    await expect(member.book(session)).rejects.toMatchObject(code('NO_ACTIVE_SUBSCRIPTION'));
  });

  it('does not allow booking draft, cancelled or completed sessions', async () => {
    const member = await db.createMember();
    for (const status of ['DRAFT', 'CANCELLED', 'COMPLETED'] as const) {
      const session = await db.createSession({ date: '2026-11-02', status });
      await expect(member.book(session)).rejects.toMatchObject(code('SESSION_NOT_PUBLISHED'));
    }
  });

  it('rejects when registration is closed', async () => {
    const member = await db.createMember();
    const session = await db.createSession({ date: '2026-11-02', registrationOpen: false });
    await expect(member.book(session)).rejects.toMatchObject(code('REGISTRATION_CLOSED'));
  });

  it('rejects sessions that already started', async () => {
    const member = await db.createMember();
    // Thursday 2026-10-29 08:00 local is 06:00Z, before BASE_NOW 07:00Z.
    const session = await db.createSession({ date: '2026-10-29', start: '08:00', end: '09:00' });
    await expect(member.book(session)).rejects.toMatchObject(code('SESSION_STARTED'));
  });

  it('enforces skill levels and requires a level to be assigned', async () => {
    const intermediate = await db.createMember({ level: 'intermediate' });
    const noLevel = await db.createMember({ level: null });
    const advancedSession = await db.createSession({ date: '2026-11-02', level: 'advanced' });
    await expect(intermediate.book(advancedSession)).rejects.toMatchObject(code('SKILL_LEVEL_MISMATCH'));
    await expect(noLevel.book(advancedSession)).rejects.toMatchObject(code('NO_SKILL_LEVEL'));
  });

  it('prevents duplicate active bookings for the same session', async () => {
    const member = await db.createMember({ limit: 3 });
    const session = await db.createSession({ date: '2026-11-02' });
    await member.book(session);
    await expect(member.book(session)).rejects.toMatchObject(code('ALREADY_BOOKED'));
  });

  it('also guards duplicates at the database constraint level', async () => {
    const member = await db.createMember({ limit: 3 });
    const session = await db.createSession({ date: '2026-11-02' });
    await member.book(session);
    await expect(
      db.sql(`insert into public.bookings (session_id, member_id) values ($1, $2)`, [session, member.userId]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('prevents overlapping bookings but allows back-to-back sessions', async () => {
    const member = await db.createMember({ limit: 3 });
    const a = await db.createSession({ date: '2026-11-02', start: '07:00', end: '08:00' });
    const overlapping = await db.createSession({ date: '2026-11-02', start: '07:30', end: '08:30' });
    const backToBack = await db.createSession({ date: '2026-11-02', start: '08:00', end: '09:00' });
    await member.book(a);
    await expect(member.book(overlapping)).rejects.toMatchObject(code('OVERLAPPING_BOOKING'));
    await expect(member.book(backToBack)).resolves.toBeTruthy();
  });

  it('allows re-booking a session after an early cancellation (history is kept)', async () => {
    const member = await db.createMember();
    const session = await db.createSession({ date: '2026-11-03' });
    const first = await member.book(session);
    await member.cancel(first);
    const second = await member.book(session);
    expect(second).not.toBe(first);
    const rows = await db.sql('select status from public.bookings where session_id = $1 order by created_at', [session]);
    expect(rows.rows.map((r) => r.status).sort()).toEqual(['CANCELLED_EARLY', 'CONFIRMED']);
  });
});

describe('capacity', () => {
  it('stops at capacity and reports SESSION_FULL', async () => {
    const session = await db.createSession({ date: '2026-11-04', capacity: 2 });
    const members = await Promise.all([db.createMember(), db.createMember(), db.createMember()]);
    await members[0].book(session);
    await members[1].book(session);
    await expect(members[2].book(session)).rejects.toMatchObject(code('SESSION_FULL'));
    expect(await db.occupied(session)).toBe(2);
  });

  it('a freed spot can be taken by someone else', async () => {
    const session = await db.createSession({ date: '2026-11-04', start: '10:00', end: '11:00', capacity: 1 });
    const [a, b] = await Promise.all([db.createMember(), db.createMember()]);
    const booking = await a.book(session);
    await expect(b.book(session)).rejects.toMatchObject(code('SESSION_FULL'));
    await a.cancel(booking);
    await expect(b.book(session)).resolves.toBeTruthy();
  });

  it('defaults to capacity 4 and cannot be set below 1', async () => {
    const res = await db.sql(
      `insert into public.sessions (session_date, start_time, end_time, skill_level_code)
       values ('2026-11-05','07:00','08:00','beginner') returning capacity`,
    );
    expect(res.rows[0].capacity).toBe(4);
    await expect(
      db.sql(
        `insert into public.sessions (session_date, start_time, end_time, skill_level_code, capacity)
         values ('2026-11-05','09:00','10:00','beginner', 0)`,
      ),
    ).rejects.toThrow();
  });
});

describe('admin manual assignment', () => {
  it('can override the skill level but never capacity', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ level: 'beginner' });
    const other = await db.createMember({ level: 'advanced' });
    const session = await db.createSession({ date: '2026-11-04', start: '12:00', end: '13:00', level: 'advanced', capacity: 1 });

    await expect(
      admin.call('admin_assign_booking', { p_session_id: session, p_member_id: member.userId, p_override_skill: false }),
    ).rejects.toMatchObject(code('SKILL_LEVEL_MISMATCH'));

    const bookingId = await admin.call<string>('admin_assign_booking', {
      p_session_id: session,
      p_member_id: member.userId,
      p_override_skill: true,
      p_note: 'coach decision',
    });
    const row = await db.sql('select skill_override, created_by from public.bookings where id = $1', [bookingId]);
    expect(row.rows[0].skill_override).toBe(true);
    expect(row.rows[0].created_by).toBe(admin.userId);

    // Capacity is physical: even an admin cannot exceed it.
    await expect(
      admin.call('admin_assign_booking', { p_session_id: session, p_member_id: other.userId, p_override_skill: true }),
    ).rejects.toMatchObject(code('SESSION_FULL'));
    expect(await db.occupied(session)).toBe(1);
  });

  it('still enforces the weekly allowance', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 1 });
    const s1 = await db.createSession({ date: '2026-11-08', start: '07:00' });
    const s2 = await db.createSession({ date: '2026-11-09', start: '07:00' });
    await admin.call('admin_assign_booking', { p_session_id: s1, p_member_id: member.userId });
    await expect(
      admin.call('admin_assign_booking', { p_session_id: s2, p_member_id: member.userId }),
    ).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));
  });

  it('is not available to trainees', async () => {
    const member = await db.createMember();
    const other = await db.createMember();
    const session = await db.createSession({ date: '2026-11-04', start: '14:00', end: '15:00' });
    await expect(
      member.call('admin_assign_booking', { p_session_id: session, p_member_id: other.userId }),
    ).rejects.toMatchObject(code('NOT_AUTHORIZED'));
  });
});

describe('schedule read API', () => {
  it('hides drafts from trainees, shows them to admins, and explains why booking is blocked', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: 1 });
    const week = '2026-11-15';
    const draft = await db.createSession({ date: '2026-11-16', status: 'DRAFT' });
    const open = await db.createSession({ date: '2026-11-17', start: '07:00' });
    const second = await db.createSession({ date: '2026-11-18', start: '07:00' });

    const memberView = await member.rpc<{ id: string; block_reason: string | null }>('get_week_schedule', { p_week_start: week });
    expect(memberView.map((r) => r.id)).not.toContain(draft);
    expect(memberView.find((r) => r.id === open)?.block_reason).toBeNull();

    const adminView = await admin.rpc<{ id: string }>('get_week_schedule', { p_week_start: week });
    expect(adminView.map((r) => r.id)).toContain(draft);

    await member.book(open);
    const after = await member.rpc<{ id: string; block_reason: string | null; my_booking_status: string | null }>(
      'get_week_schedule',
      { p_week_start: week },
    );
    expect(after.find((r) => r.id === open)).toMatchObject({ block_reason: 'ALREADY_BOOKED', my_booking_status: 'CONFIRMED' });
    expect(after.find((r) => r.id === second)?.block_reason).toBe('NO_ALLOWANCE_REMAINING');
  });

  it('exposes occupancy numbers without leaking other members', async () => {
    const member = await db.createMember();
    const other = await db.createMember();
    const session = await db.createSession({ date: '2026-11-24', capacity: 3 });
    await other.book(session);
    const rows = await member.rpc<Record<string, unknown>>('get_week_schedule', { p_week_start: '2026-11-22' });
    const row = rows.find((r) => r.id === session)!;
    expect(row.occupied_count).toBe(1);
    expect(row.capacity).toBe(3);
    expect(row.my_booking_id).toBeNull();
    expect(Object.keys(row).some((k) => k.includes('member'))).toBe(false);
  });
});

void NEXT_WEEK;
