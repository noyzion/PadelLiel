import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BASE_NOW, TestDb, type UserSession } from './support/harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.setNow(BASE_NOW);
});
afterEach(async () => {
  await db.setNow(BASE_NOW);
});

async function notificationsOf(user: UserSession) {
  const r = await user.query<{ type: string; title: string; message: string; destination_url: string | null }>(
    'select type, title, message, destination_url from public.notifications order by created_at, id',
  );
  return r.rows;
}

describe('staff notifications', () => {
  it('tells every coach when a trainee is waiting for approval', async () => {
    const coach = await db.createAdmin('Liel');
    const other = await db.createAdmin('Maya');
    const pending = await db.createMember({ name: 'דנה', approved: false });

    for (const staff of [coach, other]) {
      const list = await notificationsOf(staff);
      const row = list.find((n) => n.type === 'staff_member_pending' && n.destination_url === `/admin/members/${pending.userId}`);
      expect(row).toMatchObject({
        type: 'staff_member_pending',
        title: 'מתאמנת ממתינה לאישור',
        message: 'דנה נרשמה ומחכה לאישור שלך.',
      });
    }
    expect(await notificationsOf(pending)).toHaveLength(0);
  });

  it('tells the coach when a trainee books herself, including a trial', async () => {
    const coach = await db.createAdmin();
    const member = await db.createMember({ name: 'נועה' });
    const session = await db.createSession({ date: '2026-11-02', start: '07:00', end: '08:00' });
    const bookingId = await member.book(session);

    const created = (await notificationsOf(coach)).filter((n) => n.type === 'staff_booking_created');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: 'הרשמה חדשה לאימון',
      destination_url: `/admin/sessions/${session}`,
    });
    expect(created[0].message).toContain('נועה');
    expect((await notificationsOf(member)).map((n) => n.type)).toEqual(['booking_confirmed']);

    const trialist = await db.createMember({ name: 'יעל', limit: null });
    const trialSession = await db.createSession({ date: '2026-11-03', start: '07:00', end: '08:00' });
    await trialist.book(trialSession);
    const trial = (await notificationsOf(coach)).filter((n) => n.type === 'staff_booking_created' && n.title === 'נרשמה לאימון ניסיון');
    expect(trial).toHaveLength(1);
    expect(trial[0].message).toContain('יעל');
    expect(bookingId).toBeTruthy();
  });

  it('does not alert the coach about bookings she assigned herself', async () => {
    const coach = await db.createAdmin();
    const member = await db.createMember({ name: 'שי' });
    const session = await db.createSession({ date: '2026-11-04', start: '07:00', end: '08:00' });
    await coach.call('admin_assign_booking', { p_session_id: session, p_member_id: member.userId });
    expect((await notificationsOf(coach)).filter((n) => n.type === 'staff_booking_created')).toHaveLength(0);
    expect((await notificationsOf(member)).map((n) => n.type)).toEqual(['booking_confirmed']);
  });

  it('tells the coach about an early or late cancel, not a coach cancel', async () => {
    const coach = await db.createAdmin();
    const member = await db.createMember({ name: 'תמר' });
    const session = await db.createSession({ date: '2026-11-05', start: '07:00', end: '08:00' });
    const bookingId = await member.book(session);
    await member.cancel(bookingId);

    const cancelled = (await notificationsOf(coach)).filter((n) => n.type === 'staff_booking_cancelled');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toMatchObject({ title: 'ביטול הרשמה', destination_url: `/admin/sessions/${session}` });
    expect(cancelled[0].message).toContain('תמר');

    const other = await db.createMember({ name: 'רוני' });
    const lateSession = await db.createSession({ date: '2026-11-06', start: '07:00', end: '08:00' });
    const lateId = await other.book(lateSession);
    await db.setNow('2026-11-06T03:30:00Z');
    await other.cancel(lateId, true);
    const late = (await notificationsOf(coach)).filter((n) => n.title === 'ביטול מאוחר');
    expect(late).toHaveLength(1);
    expect(late[0].message).toContain('עדיין נספר במכסה');
    await db.setNow(BASE_NOW);

    const held = await db.createMember({ name: 'מיכל' });
    const coachCancel = await db.createSession({ date: '2026-11-09', start: '07:00', end: '08:00' });
    await held.book(coachCancel);
    await coach.call('admin_cancel_session', { p_session_id: coachCancel });
    expect((await notificationsOf(coach)).filter((n) => n.type === 'staff_booking_cancelled' && n.destination_url === `/admin/sessions/${coachCancel}`)).toHaveLength(0);
  });

  it('tells the coach when someone joins a waitlist', async () => {
    const coach = await db.createAdmin();
    const session = await db.createSession({ date: '2026-11-10', start: '07:00', end: '08:00', capacity: 1 });
    const holder = await db.createMember({ name: 'מלאה' });
    await holder.book(session);
    const waiter = await db.createMember({ name: 'אורי' });
    await waiter.call('join_waitlist', { p_session_id: session });

    const waiting = (await notificationsOf(coach)).filter((n) => n.type === 'staff_waitlist_joined');
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({
      title: 'רשימת המתנה',
      destination_url: `/admin/sessions/${session}`,
    });
    expect(waiting[0].message).toContain('אורי');
  });
});
