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

/** Runs SQL as the `anon` role (a visitor who is not logged in). */
async function asAnon(sql: string) {
  const client = await db.pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role anon');
    return await client.query(sql);
  } finally {
    await client.query('rollback');
    client.release();
  }
}

describe('profiles', () => {
  it('registration creates a pending trainee profile; metadata can never grant a role', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    await db.sql('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
      id,
      'New@Example.com',
      JSON.stringify({ full_name: 'Dana', phone: '052-1234567', role: 'admin', approval_status: 'approved' }),
    ]);
    const r = await db.sql('select role, approval_status, full_name, phone, email from public.profiles where id = $1', [id]);
    expect(r.rows[0]).toEqual({
      role: 'trainee',
      approval_status: 'pending',
      full_name: 'Dana',
      phone: '052-1234567',
      email: 'new@example.com',
    });
  });

  it('a trainee sees only her own profile; the admin sees all', async () => {
    const admin = await db.createAdmin();
    const a = await db.createMember({ name: 'A' });
    await db.createMember({ name: 'B' });
    const own = await a.query('select id from public.profiles');
    expect(own.rows).toEqual([{ id: a.userId }]);
    const all = await admin.query('select id from public.profiles');
    expect(all.rowCount).toBeGreaterThan(2);
  });

  it('a trainee can update her name/phone but not role, approval, level or notes', async () => {
    const m = await db.createMember({ approved: false, level: null });
    await m.query("update public.profiles set full_name = 'Renamed', phone = '050-9' where id = $1", [m.userId]);
    const r = await db.sql('select full_name, phone from public.profiles where id = $1', [m.userId]);
    expect(r.rows[0]).toEqual({ full_name: 'Renamed', phone: '050-9' });

    for (const col of ["role = 'admin'", "approval_status = 'approved'", "skill_level_code = 'advanced'", "admin_notes = 'x'"]) {
      await expect(m.query(`update public.profiles set ${col} where id = $1`, [m.userId])).rejects.toMatchObject({
        message: expect.stringContaining('permission denied'),
      });
    }
  });

  it("a trainee cannot update another trainee's profile", async () => {
    const a = await db.createMember();
    const b = await db.createMember({ name: 'Original' });
    const res = await a.query("update public.profiles set full_name = 'Hacked' where id = $1", [b.userId]);
    expect(res.rowCount).toBe(0);
  });

  it('only the admin RPC can approve and set levels, and it is audited', async () => {
    const admin = await db.createAdmin();
    const m = await db.createMember({ approved: false, level: null });
    await expect(
      m.call('admin_update_member', { p_member_id: m.userId, p_patch: JSON.stringify({ approval_status: 'approved' }) }),
    ).rejects.toMatchObject(code('NOT_AUTHORIZED'));

    await admin.call('admin_update_member', {
      p_member_id: m.userId,
      p_patch: JSON.stringify({ approval_status: 'approved', skill_level_code: 'advanced', admin_notes: 'left-handed' }),
    });
    const r = await db.sql('select approval_status, skill_level_code, admin_notes from public.profiles where id = $1', [m.userId]);
    expect(r.rows[0]).toEqual({ approval_status: 'approved', skill_level_code: 'advanced', admin_notes: 'left-handed' });
    const audit = await db.sql("select actor_id from public.audit_logs where action = 'update:profiles' and entity_id = $1", [m.userId]);
    expect(audit.rows[0].actor_id).toBe(admin.userId);
  });

  it('admin cannot be demoted or edited through the member RPC (trainees only)', async () => {
    const admin = await db.createAdmin();
    await expect(
      admin.call('admin_update_member', { p_member_id: admin.userId, p_patch: JSON.stringify({ approval_status: 'rejected' }) }),
    ).rejects.toMatchObject(code('MEMBER_NOT_FOUND'));
  });

  it('a pending admin-role profile has no admin powers', async () => {
    const id = (await db.createAdmin()).userId;
    await db.sql("update public.profiles set approval_status = 'pending' where id = $1", [id]);
    const s = db.as(id);
    await expect(s.call('admin_cancel_session', { p_session_id: '00000000-0000-0000-0000-000000000000' })).rejects.toMatchObject(code('NOT_AUTHORIZED'));
  });
});

describe('private data isolation', () => {
  it("trainees cannot read other trainees' bookings, subscriptions, adjustments or waitlist rows", async () => {
    const admin = await db.createAdmin();
    const a = await db.createMember();
    const b = await db.createMember();
    const session = await db.createSession({ date: '2026-11-03', capacity: 1 });
    await a.book(session);
    await b.call('join_waitlist', { p_session_id: session });
    await admin.call('admin_adjust_allowance', { p_member_id: a.userId, p_month_start: '2026-11-01', p_delta: 1, p_reason: 'test' });

    for (const table of ['bookings', 'member_subscriptions', 'allowance_adjustments', 'waitlist_entries']) {
      const rows = await b.query<{ member_id: string }>(`select member_id from public.${table}`);
      expect(rows.rows.every((r) => r.member_id === b.userId), table).toBe(true);
    }
    expect((await b.query('select * from public.bookings')).rowCount).toBe(0);
    expect((await a.query('select * from public.bookings')).rowCount).toBe(1);
    expect((await admin.query('select * from public.bookings')).rowCount).toBeGreaterThan(0);
  });

  it('trainees cannot read the audit log; the admin can', async () => {
    const admin = await db.createAdmin();
    const m = await db.createMember();
    expect((await m.query('select * from public.audit_logs')).rowCount).toBe(0);
    expect((await admin.query('select * from public.audit_logs')).rowCount).toBeGreaterThan(0);
  });

  it('draft sessions are invisible to trainees at the table level', async () => {
    const m = await db.createMember();
    const draft = await db.createSession({ date: '2026-11-20', status: 'DRAFT' });
    const rows = await m.query('select id from public.sessions where id = $1', [draft]);
    expect(rows.rowCount).toBe(0);
  });

  it('anonymous visitors cannot read or call anything', async () => {
    await expect(asAnon('select * from public.profiles')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select * from public.sessions')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select * from public.bookings')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select * from public.get_week_schedule(current_date)')).rejects.toThrow(/permission denied/);
  });
});

describe('write protection', () => {
  it('trainees cannot write bookings, waitlist rows, subscriptions or adjustments directly', async () => {
    const m = await db.createMember();
    const session = await db.createSession({ date: '2026-11-03', start: '16:00', end: '17:00' });
    const attempts = [
      ['insert into public.bookings (session_id, member_id) values ($1, $2)', [session, m.userId]],
      ['insert into public.waitlist_entries (session_id, member_id) values ($1, $2)', [session, m.userId]],
      ["insert into public.allowance_adjustments (member_id, month_start, delta, kind, reason) values ($1, '2026-11-01', 5, 'manual', 'x')", [m.userId]],
      ['update public.member_subscriptions set is_active = true where member_id = $1', [m.userId]],
      ["update public.bookings set status = 'ATTENDED' where member_id = $1", [m.userId]],
      ['delete from public.bookings where member_id = $1', [m.userId]],
      ['insert into public.audit_logs (action, entity_type) values (\'x\', \'y\')', []],
    ] as const;
    for (const [sql, params] of attempts) {
      await expect(m.query(sql, [...params]), sql).rejects.toThrow(/permission denied/);
    }
  });

  it('trainees cannot manage sessions, plans or settings; the admin can', async () => {
    const m = await db.createMember();
    const admin = await db.createAdmin();
    await expect(
      m.query("insert into public.sessions (session_date, start_time, end_time, skill_level_code) values ('2026-12-01','07:00','08:00','beginner')"),
    ).rejects.toThrow(/row-level security/);
    const upd = await m.query("update public.subscription_plans set monthly_session_limit = 14");
    expect(upd.rowCount).toBe(0);
    const set = await m.query("update public.app_settings set value = '0'::jsonb where key = 'cancellation_cutoff_hours'");
    expect(set.rowCount).toBe(0);

    await admin.query("insert into public.sessions (session_date, start_time, end_time, skill_level_code) values ('2026-12-01','07:00','08:00','beginner')");
    await admin.query("insert into public.subscription_plans (name, monthly_session_limit) values ('VIP', 5)");
  });

  it('no payment, invoice, wallet or credit tables exist', async () => {
    const r = await db.sql(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name ~* '(payment|invoice|checkout|wallet|credit|billing|charge)'`,
    );
    expect(r.rowCount).toBe(0);
  });

  it('internal helper functions are not callable by trainees', async () => {
    const m = await db.createMember();
    const session = await db.createSession({ date: '2026-11-03', start: '18:00', end: '19:00' });
    await expect(
      m.query('select public.create_booking_internal($1, $2, true, true, true, null)', [m.userId, session]),
    ).rejects.toThrow(/permission denied/);
    await expect(m.query('select * from public.allowance_for_month($1, current_date)', [m.userId])).rejects.toThrow(/permission denied/);
  });

  it("allowance of other members is not readable through the RPC", async () => {
    const a = await db.createMember();
    const b = await db.createMember();
    await expect(b.rpc('get_member_allowance', { p_member_id: a.userId, p_month_start: '2026-11-01' })).rejects.toMatchObject(code('NOT_AUTHORIZED'));
  });
});
