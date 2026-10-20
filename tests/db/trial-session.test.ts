import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NEXT_MONTH, TestDb } from './support/harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});

const code = (c: string) => expect.objectContaining({ message: c });

describe('one free trial session', () => {
  it('is available only before any subscription exists, and she picks the slot', async () => {
    const member = await db.createMember({ limit: null });
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({
      has_active_subscription: false,
      used: 0,
      trial_available: true,
    });

    const session = await db.createSession({ date: '2026-11-04', start: '17:00', end: '18:00' });
    const schedule = await member.rpc<{ id: string; block_reason: string | null }>('get_week_schedule', {
      p_week_start: '2026-11-01',
    });
    expect(schedule.find((s) => s.id === session)?.block_reason).toBeNull();

    const bookingId = await member.book(session);
    const mine = await member.rpc<{ booking_id: string; is_trial: boolean; counts_toward_allowance: boolean }>(
      'get_my_bookings',
    );
    expect(mine[0]).toMatchObject({ booking_id: bookingId, is_trial: true, counts_toward_allowance: false });
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ used: 0, trial_available: false });
  });

  it('an early cancel returns the trial; a late cancel consumes it', async () => {
    const member = await db.createMember({ limit: null, name: 'Early' });
    const session = await db.createSession({ date: '2026-11-05', start: '07:00' });
    const bookingId = await member.book(session);
    expect(await member.cancel(bookingId)).toMatchObject({ status: 'CANCELLED_EARLY', allowance_restored: true });
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ trial_available: true });

    const again = await db.createSession({ date: '2026-11-06', start: '07:00' });
    const lateId = await member.book(again);
    await db.setNow('2026-11-06T03:30:00Z');
    expect(await member.cancel(lateId, true)).toMatchObject({ status: 'CANCELLED_LATE', allowance_restored: false });
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ trial_available: false, used: 0 });
    await db.setNow('2026-10-29T07:00:00Z');
  });

  it('does not consume the monthly quota after she later gets a plan', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: null, name: 'LaterPlan' });
    const trialSession = await db.createSession({ date: '2026-11-02', start: '07:00' });
    await member.book(trialSession);

    await admin.call('admin_assign_subscription', {
      p_member_id: member.userId,
      p_plan_id: await db.planIdForLimit(2),
      p_starts_on: '2026-11-01',
    });

    expect(await member.allowance(NEXT_MONTH)).toMatchObject({
      has_active_subscription: true,
      plan_limit: 2,
      used: 0,
      remaining: 2,
      trial_available: false,
    });

    const paid = await db.createSession({ date: '2026-11-03', start: '07:00' });
    await member.book(paid);
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ used: 1, remaining: 1 });
  });

  it('lets her pick any level, even with no level assigned yet', async () => {
    const noLevel = await db.createMember({ limit: null, name: 'NoLevel', level: null });
    const advanced = await db.createSession({ date: '2026-11-09', level: 'advanced' });
    await expect(noLevel.book(advanced)).resolves.toBeTruthy();

    const otherLevel = await db.createMember({ limit: null, name: 'OtherLevel', level: 'beginner' });
    const intermediate = await db.createSession({ date: '2026-11-13', level: 'intermediate' });
    await expect(otherLevel.book(intermediate)).resolves.toBeTruthy();
  });

  it('still enforces overlap after the trial is taken', async () => {
    const member = await db.createMember({ limit: null, name: 'Rules', level: 'intermediate' });
    const a = await db.createSession({ date: '2026-11-10', start: '07:00', end: '08:00' });
    const overlap = await db.createSession({ date: '2026-11-10', start: '07:30', end: '08:30' });
    await member.book(a);
    await expect(member.book(overlap)).rejects.toMatchObject(code('OVERLAPPING_BOOKING'));
  });

  it('a coach cancel restores the trial', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ limit: null, name: 'CoachCancel' });
    const session = await db.createSession({ date: '2026-11-11' });
    const bookingId = await member.book(session);
    await admin.call('admin_set_booking_status', { p_booking_id: bookingId, p_status: 'CANCELLED_BY_COACH' });
    expect(await member.allowance(NEXT_MONTH)).toMatchObject({ trial_available: true, used: 0 });
    const other = await db.createSession({ date: '2026-11-12' });
    await expect(member.book(other)).resolves.toBeTruthy();
  });
});
