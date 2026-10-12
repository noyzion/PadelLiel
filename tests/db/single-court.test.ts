import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestDb } from './support/harness';

// There is exactly one padel court: no two non-cancelled sessions may run at the same time.
let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
  await db.setSingleCourt(true);
});
afterAll(async () => {
  await db.close();
});

const code = (c: string) => expect.objectContaining({ message: c });

describe('single court: no parallel sessions', () => {
  it('rejects a session that overlaps another one, whatever the level', async () => {
    await db.createSession({ date: '2026-11-02', start: '07:00', end: '08:00', level: 'beginner' });
    await expect(db.createSession({ date: '2026-11-02', start: '07:00', end: '08:00', level: 'advanced' })).rejects.toMatchObject(code('SESSION_OVERLAP'));
    await expect(db.createSession({ date: '2026-11-02', start: '07:30', end: '08:30' })).rejects.toMatchObject(code('SESSION_OVERLAP'));
    await expect(db.createSession({ date: '2026-11-02', start: '06:00', end: '07:01' })).rejects.toMatchObject(code('SESSION_OVERLAP'));
    await expect(db.createSession({ date: '2026-11-02', start: '07:15', end: '07:45' })).rejects.toMatchObject(code('SESSION_OVERLAP'));
  });

  it('allows back-to-back sessions and other days', async () => {
    await db.createSession({ date: '2026-11-03', start: '07:00', end: '08:00' });
    await expect(db.createSession({ date: '2026-11-03', start: '08:00', end: '09:00' })).resolves.toBeTruthy();
    await expect(db.createSession({ date: '2026-11-03', start: '06:00', end: '07:00' })).resolves.toBeTruthy();
    await expect(db.createSession({ date: '2026-11-04', start: '07:00', end: '08:00' })).resolves.toBeTruthy();
  });

  it('drafts hold the court too, cancelled sessions free it', async () => {
    const draft = await db.createSession({ date: '2026-11-05', start: '07:00', end: '08:00', status: 'DRAFT' });
    await expect(db.createSession({ date: '2026-11-05', start: '07:00', end: '08:00' })).rejects.toMatchObject(code('SESSION_OVERLAP'));
    await db.sql("update public.sessions set status = 'CANCELLED' where id = $1", [draft]);
    await expect(db.createSession({ date: '2026-11-05', start: '07:00', end: '08:00' })).resolves.toBeTruthy();
    // a cancelled session may overlap anything
    await expect(db.createSession({ date: '2026-11-05', start: '07:30', end: '08:30', status: 'CANCELLED' })).resolves.toBeTruthy();
  });

  it('rejects moving a session onto another one, but not editing it in place', async () => {
    const admin = await db.createAdmin();
    const a = await db.createSession({ date: '2026-11-08', start: '07:00', end: '08:00' });
    const b = await db.createSession({ date: '2026-11-08', start: '09:00', end: '10:00' });
    await expect(admin.query("update public.sessions set start_time = '07:30', end_time = '08:30' where id = $1", [b])).rejects.toMatchObject(code('SESSION_OVERLAP'));
    await expect(admin.query("update public.sessions set session_date = '2026-11-08', start_time = '07:00' where id = $1", [b])).rejects.toMatchObject(code('SESSION_OVERLAP'));
    // unrelated edits and a move to a free time are fine
    await admin.query('update public.sessions set capacity = 6, registration_open = false where id = $1', [a]);
    await admin.query("update public.sessions set start_time = '10:00', end_time = '11:00' where id = $1", [b]);
    // extending a session into its neighbour is rejected, extending up to it is fine
    await expect(admin.query("update public.sessions set end_time = '10:30' where id = $1", [a])).rejects.toMatchObject(code('SESSION_OVERLAP'));
    await expect(admin.query("update public.sessions set end_time = '10:00' where id = $1", [a])).resolves.toBeTruthy();
  });

  it('a bulk insert with overlapping rows is rejected as a whole', async () => {
    const admin = await db.createAdmin();
    await expect(
      admin.query(
        `insert into public.sessions (session_date, start_time, end_time, skill_level_code)
         values ('2026-11-10','07:00','08:00','beginner'), ('2026-11-10','07:30','08:30','advanced')`,
      ),
    ).rejects.toMatchObject(code('SESSION_OVERLAP'));
    const n = await db.sql("select count(*)::int n from public.sessions where session_date = '2026-11-10'");
    expect(n.rows[0].n).toBe(0);
  });

  it('simultaneous inserts for the same time: exactly one succeeds', async () => {
    for (let round = 0; round < 5; round++) {
      const date = `2026-11-${String(11 + round).padStart(2, '0')}`;
      const results = await Promise.allSettled(
        ['beginner', 'intermediate', 'advanced', 'beginner'].map((level) =>
          db.createSession({ date, start: '07:00', end: '08:00', level: level as 'beginner' }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results) {
        if (r.status === 'rejected') expect(r.reason).toMatchObject(code('SESSION_OVERLAP'));
      }
    }
  });

  it('existing overlapping sessions stay editable and cancellable', async () => {
    const admin = await db.createAdmin();
    await db.setSingleCourt(false);
    const a = await db.createSession({ date: '2026-11-20', start: '07:00', end: '08:00', level: 'beginner' });
    const b = await db.createSession({ date: '2026-11-20', start: '07:00', end: '08:00', level: 'advanced' });
    await db.setSingleCourt(true);
    await admin.query('update public.sessions set capacity = 5, registration_open = false where id = $1', [a]);
    await admin.query("update public.sessions set status = 'CANCELLED' where id = $1", [b]);
  });

  it('duplicating a week skips times that are already taken in the target week', async () => {
    const admin = await db.createAdmin();
    await db.createSession({ date: '2026-12-06', start: '07:00', end: '08:00' });
    await db.createSession({ date: '2026-12-06', start: '08:00', end: '09:00' });
    await db.createSession({ date: '2026-12-13', start: '07:30', end: '08:30' }); // blocks both copies' slots
    const n = await admin.call<number>('admin_duplicate_week', { p_from_week: '2026-12-06', p_to_week: '2026-12-13' });
    expect(n).toBe(0);

    await db.createSession({ date: '2026-12-07', start: '07:00', end: '08:00' });
    const m = await admin.call<number>('admin_duplicate_week', { p_from_week: '2026-12-06', p_to_week: '2026-12-20' });
    expect(m).toBe(3);
    expect(await admin.call<number>('admin_duplicate_week', { p_from_week: '2026-12-06', p_to_week: '2026-12-20' })).toBe(0);
  });
});
