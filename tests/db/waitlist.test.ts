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

async function fullSession(date = '2026-11-03', capacity = 1) {
  const session = await db.createSession({ date, start: '07:00', capacity });
  const holders = [];
  for (let i = 0; i < capacity; i++) {
    const h = await db.createMember({ limit: 3 });
    const bookingId = await h.book(session);
    holders.push({ member: h, bookingId });
  }
  return { session, holders };
}

describe('waiting list', () => {
  it('can only be joined when the session is full', async () => {
    const session = await db.createSession({ date: '2026-11-03', start: '09:00', end: '10:00', capacity: 2 });
    const m = await db.createMember();
    await expect(m.call('join_waitlist', { p_session_id: session })).rejects.toMatchObject(code('SESSION_NOT_FULL'));
  });

  it('joining does not consume allowance; positions follow join order', async () => {
    const { session } = await fullSession();
    const a = await db.createMember({ limit: 1 });
    const b = await db.createMember({ limit: 1 });
    await a.call('join_waitlist', { p_session_id: session });
    await b.call('join_waitlist', { p_session_id: session });
    expect(await a.allowance('2026-11-01')).toMatchObject({ used: 0, remaining: 1 });

    const viewA = (await a.rpc<{ id: string; my_waitlist_position: number; waitlist_count: number }>('get_week_schedule', { p_week_start: '2026-11-01' })).find((r) => r.id === session)!;
    const viewB = (await b.rpc<{ id: string; my_waitlist_position: number }>('get_week_schedule', { p_week_start: '2026-11-01' })).find((r) => r.id === session)!;
    expect(viewA.my_waitlist_position).toBe(1);
    expect(viewB.my_waitlist_position).toBe(2);
    expect(viewA.waitlist_count).toBe(2);
  });

  it('cannot join twice, cannot join with a booked session or without eligibility', async () => {
    const { session, holders } = await fullSession('2026-11-04');
    const m = await db.createMember();
    await m.call('join_waitlist', { p_session_id: session });
    await expect(m.call('join_waitlist', { p_session_id: session })).rejects.toMatchObject(code('ALREADY_ON_WAITLIST'));
    await expect(holders[0].member.call('join_waitlist', { p_session_id: session })).rejects.toMatchObject(code('ALREADY_BOOKED'));
    const wrongLevel = await db.createMember({ level: 'beginner' });
    await expect(wrongLevel.call('join_waitlist', { p_session_id: session })).rejects.toMatchObject(code('SKILL_LEVEL_MISMATCH'));
    const noSub = await db.createMember({ limit: null });
    await expect(noSub.call('join_waitlist', { p_session_id: session })).resolves.toBeTruthy();
    const usedTrial = await db.createMember({ limit: null, name: 'UsedTrial' });
    const other = await db.createSession({ date: '2026-11-06', start: '09:00', end: '10:00' });
    await usedTrial.book(other);
    await expect(usedTrial.call('join_waitlist', { p_session_id: session })).rejects.toMatchObject(code('TRIAL_ALREADY_USED'));
  });

  it('a member without remaining allowance cannot join', async () => {
    const { session } = await fullSession('2026-11-05');
    const m = await db.createMember({ limit: 1 });
    const other = await db.createSession({ date: '2026-11-06', start: '07:00' });
    await m.book(other);
    await expect(m.call('join_waitlist', { p_session_id: session })).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));
  });

  it('members can leave; entries are kept as history', async () => {
    const { session } = await fullSession('2026-11-07');
    const m = await db.createMember();
    const entry = await m.call<string>('join_waitlist', { p_session_id: session });
    await m.call('leave_waitlist', { p_entry_id: entry });
    const row = await db.sql('select status, resolved_at from public.waitlist_entries where id = $1', [entry]);
    expect(row.rows[0].status).toBe('LEFT');
    expect(row.rows[0].resolved_at).not.toBeNull();
    await expect(m.call('leave_waitlist', { p_entry_id: entry })).rejects.toMatchObject(code('WAITLIST_ENTRY_NOT_FOUND'));
    // can rejoin afterwards
    await expect(m.call('join_waitlist', { p_session_id: session })).resolves.toBeTruthy();
  });

  it('a member cannot remove someone else from the list', async () => {
    const { session } = await fullSession('2026-11-08');
    const a = await db.createMember();
    const b = await db.createMember();
    const entry = await a.call<string>('join_waitlist', { p_session_id: session });
    await expect(b.call('leave_waitlist', { p_entry_id: entry })).rejects.toMatchObject(code('WAITLIST_ENTRY_NOT_FOUND'));
    await expect(b.call('admin_remove_waitlist_entry', { p_entry_id: entry })).rejects.toMatchObject(code('NOT_AUTHORIZED'));
  });
});

describe('promotion by the admin', () => {
  it('requires a free spot and re-checks eligibility (allowance, capacity)', async () => {
    const admin = await db.createAdmin();
    const { session, holders } = await fullSession('2026-11-09');
    const waiter = await db.createMember({ limit: 1 });
    const entry = await waiter.call<string>('join_waitlist', { p_session_id: session });

    // still full -> capacity can never be exceeded, even by the admin
    await expect(admin.call('admin_promote_waitlist_entry', { p_entry_id: entry })).rejects.toMatchObject(code('SESSION_FULL'));

    await holders[0].member.cancel(holders[0].bookingId);

    // meanwhile the waiter used her only session elsewhere -> allowance re-check blocks the promotion
    const elsewhere = await db.createSession({ date: '2026-11-10', start: '07:00' });
    await waiter.book(elsewhere);
    await expect(admin.call('admin_promote_waitlist_entry', { p_entry_id: entry })).rejects.toMatchObject(code('NO_ALLOWANCE_REMAINING'));
    expect(await db.occupied(session)).toBe(0);
  });

  it('converts the entry into a confirmed booking and marks it PROMOTED', async () => {
    const admin = await db.createAdmin();
    const { session, holders } = await fullSession('2026-11-11');
    const waiter = await db.createMember();
    const entry = await waiter.call<string>('join_waitlist', { p_session_id: session });
    await holders[0].member.cancel(holders[0].bookingId);

    const bookingId = await admin.call<string>('admin_promote_waitlist_entry', { p_entry_id: entry });
    expect(await db.bookingStatus(bookingId)).toBe('CONFIRMED');
    const row = await db.sql('select status, booking_id from public.waitlist_entries where id = $1', [entry]);
    expect(row.rows[0]).toMatchObject({ status: 'PROMOTED', booking_id: bookingId });
    expect(await db.occupied(session)).toBe(1);
    expect((await waiter.allowance('2026-11-08')).used).toBe(1);
  });

  it('a waiting member who books directly after a cancellation resolves her own entry', async () => {
    const { session, holders } = await fullSession('2026-11-12');
    const waiter = await db.createMember();
    const entry = await waiter.call<string>('join_waitlist', { p_session_id: session });
    await holders[0].member.cancel(holders[0].bookingId);
    const bookingId = await waiter.book(session);
    const row = await db.sql('select status, booking_id from public.waitlist_entries where id = $1', [entry]);
    expect(row.rows[0]).toMatchObject({ status: 'PROMOTED', booking_id: bookingId });
  });

  it('admin can remove entries; coach cancelling the session clears the list', async () => {
    const admin = await db.createAdmin();
    const { session } = await fullSession('2026-11-13');
    const a = await db.createMember();
    const b = await db.createMember();
    const ea = await a.call<string>('join_waitlist', { p_session_id: session });
    await b.call('join_waitlist', { p_session_id: session });
    await admin.call('admin_remove_waitlist_entry', { p_entry_id: ea });
    await admin.call('admin_cancel_session', { p_session_id: session });
    const rows = await db.sql('select status from public.waitlist_entries where session_id = $1', [session]);
    expect(rows.rows.map((r) => r.status)).toEqual(['REMOVED', 'REMOVED']);
  });
});
