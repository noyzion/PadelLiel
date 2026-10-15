import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BASE_NOW, THIS_MONTH, TestDb } from './support/harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});

interface Row {
  id: string;
  full_name: string;
  approval_status: string;
  plan_name: string | null;
  monthly_limit: number;
  used: number;
  remaining: number;
  adjustments: number;
  has_active_subscription: boolean;
}

describe('admin_list_members', () => {
  it('lists trainees with plan and monthly usage, pending approvals first, never admins', async () => {
    const admin = await db.createAdmin('Test Admin');
    const active = await db.createMember({ name: 'Bar', limit: 2 });
    const pending = await db.createMember({ name: 'Zohar', approved: false, limit: null });
    const noSub = await db.createMember({ name: 'Adi', limit: null });

    const s1 = await db.createSession({ date: '2026-10-30', start: '07:00', end: '08:00' });
    await active.book(s1);

    const rows = await admin.rpc<Row>('admin_list_members', { p_month_start: THIS_MONTH });
    const byName = new Map(rows.map((r) => [r.full_name, r]));

    expect(byName.has('Test Admin')).toBe(false);
    expect(rows[0].full_name).toBe('Zohar'); // pending approval first

    expect(byName.get('Bar')).toMatchObject({ has_active_subscription: true, monthly_limit: 2, used: 1, remaining: 1 });
    expect(byName.get('Adi')).toMatchObject({ has_active_subscription: false, plan_name: null, used: 0 });
    expect(byName.get('Zohar')).toMatchObject({ approval_status: 'pending', has_active_subscription: false });
    expect(pending.userId).toBeTruthy();
    expect(noSub.userId).toBeTruthy();
  });

  it('reflects manual adjustments and a late cancellation that still counts', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ name: 'Maya', limit: 1 });
    const session = await db.createSession({ date: '2026-10-30', start: '09:00', end: '10:00' });
    const bookingId = await member.book(session);

    // 2026-10-29T07:00Z is >8h before the session on the 30th, so move the clock into the late window.
    await db.setNow('2026-10-30T05:00:00Z');
    await member.cancel(bookingId, true);
    await db.setNow(BASE_NOW);

    let row = (await admin.rpc<Row>('admin_list_members', { p_month_start: THIS_MONTH })).find((r) => r.full_name === 'Maya')!;
    expect(row).toMatchObject({ used: 1, remaining: 0 });

    await admin.call('admin_adjust_allowance', {
      p_member_id: member.userId,
      p_month_start: THIS_MONTH,
      p_delta: 1,
      p_reason: 'בדיקה',
    });
    row = (await admin.rpc<Row>('admin_list_members', { p_month_start: THIS_MONTH })).find((r) => r.full_name === 'Maya')!;
    expect(row).toMatchObject({ adjustments: 1, remaining: 1 });
  });

  it('is restricted to admins', async () => {
    const member = await db.createMember();
    await expect(member.rpc('admin_list_members', { p_month_start: THIS_MONTH })).rejects.toMatchObject({ message: 'NOT_AUTHORIZED' });
  });
});

describe('inactive and deleted trainees', () => {
  it('an inactive trainee can no longer book, and can be re-activated', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ name: 'Noa', limit: 2 });
    const session = await db.createSession({ date: '2026-10-30', start: '07:00', end: '08:00' });

    await admin.call('admin_update_member', { p_member_id: member.userId, p_patch: { approval_status: 'inactive' } });
    const rows = await admin.rpc<Row>('admin_list_members', { p_month_start: THIS_MONTH });
    expect(rows.find((r) => r.full_name === 'Noa')).toMatchObject({ approval_status: 'inactive' });
    await expect(member.book(session)).rejects.toMatchObject({ message: 'MEMBER_NOT_APPROVED' });

    await admin.call('admin_update_member', { p_member_id: member.userId, p_patch: { approval_status: 'approved' } });
    await expect(member.book(session)).resolves.toBeTruthy();
  });

  it('deletes a trainee without history together with her login', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ name: 'Delete Me', limit: 2 });

    await admin.call('admin_delete_member', { p_member_id: member.userId });

    const profile = await db.sql('select 1 from public.profiles where id = $1', [member.userId]);
    const login = await db.sql('select 1 from auth.users where id = $1', [member.userId]);
    const subs = await db.sql('select 1 from public.member_subscriptions where member_id = $1', [member.userId]);
    expect(profile.rowCount).toBe(0);
    expect(login.rowCount).toBe(0);
    expect(subs.rowCount).toBe(0);
    const audit = await db.sql("select 1 from public.audit_logs where action = 'delete:profiles' and entity_id = $1", [member.userId]);
    expect(audit.rowCount).toBe(1);
  });

  it('refuses to delete a trainee who has bookings', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ name: 'Has History', limit: 2 });
    const session = await db.createSession({ date: '2026-10-30', start: '09:00', end: '10:00' });
    await member.book(session);

    await expect(admin.call('admin_delete_member', { p_member_id: member.userId })).rejects.toMatchObject({
      message: 'MEMBER_HAS_HISTORY',
    });
    const profile = await db.sql('select 1 from public.profiles where id = $1', [member.userId]);
    expect(profile.rowCount).toBe(1);
  });

  it('only admins can delete, and admins cannot be deleted', async () => {
    const admin = await db.createAdmin();
    const other = await db.createAdmin('Other Admin');
    const member = await db.createMember();
    const victim = await db.createMember();

    await expect(member.call('admin_delete_member', { p_member_id: victim.userId })).rejects.toMatchObject({ message: 'NOT_AUTHORIZED' });
    await expect(admin.call('admin_delete_member', { p_member_id: other.userId })).rejects.toMatchObject({ message: 'MEMBER_NOT_FOUND' });
  });
});

describe('admin_reset_member_password', () => {
  const passwordHash = async (id: string) =>
    (await db.sql<{ encrypted_password: string | null }>('select encrypted_password from auth.users where id = $1', [id])).rows[0]
      .encrypted_password;

  it('sets a random temporary password, returns it once, and stores only a bcrypt hash that matches it', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember({ name: 'Forgot' });
    const before = await passwordHash(member.userId);

    const password = await admin.call<string>('admin_reset_member_password', { p_member_id: member.userId });

    expect(password).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
    const hash = await passwordHash(member.userId);
    expect(hash).not.toBe(before);
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(hash).not.toContain(password);
    const matches = await db.sql<{ ok: boolean }>('select extensions.crypt($1, $2) = $2 as ok', [password, hash]);
    expect(matches.rows[0].ok).toBe(true);

    // Every reset is a new password.
    const second = await admin.call<string>('admin_reset_member_password', { p_member_id: member.userId });
    expect(second).not.toBe(password);
  });

  it('signs the trainee out of every device', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();
    const other = await db.createMember();
    await db.sql('insert into auth.sessions (user_id) values ($1), ($1), ($2)', [member.userId, other.userId]);

    await admin.call('admin_reset_member_password', { p_member_id: member.userId });

    const mine = await db.sql('select 1 from auth.sessions where user_id = $1', [member.userId]);
    const theirs = await db.sql('select 1 from auth.sessions where user_id = $1', [other.userId]);
    expect(mine.rowCount).toBe(0);
    expect(theirs.rowCount).toBe(1);
  });

  it('is audited, without ever recording the password', async () => {
    const admin = await db.createAdmin();
    const member = await db.createMember();

    const password = await admin.call<string>('admin_reset_member_password', { p_member_id: member.userId });

    const audit = await db.sql<{ actor_id: string; details: unknown }>(
      "select actor_id, details from public.audit_logs where action = 'reset_password:profiles' and entity_id = $1",
      [member.userId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].actor_id).toBe(admin.userId);
    expect(JSON.stringify(audit.rows[0])).not.toContain(password);
  });

  it('only an admin can reset, and never an admin account or a stranger', async () => {
    const admin = await db.createAdmin();
    const otherAdmin = await db.createAdmin('Other Admin');
    const member = await db.createMember();
    const victim = await db.createMember();
    const victimBefore = await passwordHash(victim.userId);

    await expect(member.call('admin_reset_member_password', { p_member_id: victim.userId })).rejects.toMatchObject({
      message: 'NOT_AUTHORIZED',
    });
    await expect(admin.call('admin_reset_member_password', { p_member_id: otherAdmin.userId })).rejects.toMatchObject({
      message: 'MEMBER_NOT_FOUND',
    });
    await expect(
      admin.call('admin_reset_member_password', { p_member_id: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ message: 'MEMBER_NOT_FOUND' });
    expect(await passwordHash(victim.userId)).toBe(victimBefore);
  });
});

