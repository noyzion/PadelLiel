import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestDb, type UserSession } from './support/harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(async () => {
  await db.close();
});

type Outcome = { ok: true; id: string } | { ok: false; code: string };

async function attempt(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { ok: true, id: String(await run()) };
  } catch (err) {
    return { ok: false, code: (err as Error).message };
  }
}

const summarize = (outcomes: Outcome[]) => ({
  successes: outcomes.filter((o) => o.ok).length,
  failures: outcomes.filter((o): o is Extract<Outcome, { ok: false }> => !o.ok).map((o) => o.code),
});

// Several rounds per scenario make an unsynchronised implementation fail with high probability.
const ROUNDS = 5;

describe('concurrent bookings - capacity', () => {
  it('only one of many trainees can take the last spot', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const session = await db.createSession({ date: '2026-11-10', start: '07:00', capacity: 1 });
      const members = await Promise.all(Array.from({ length: 10 }, () => db.createMember()));
      const outcomes = await Promise.all(members.map((m) => attempt(() => m.book(session))));
      const { successes, failures } = summarize(outcomes);
      expect(successes).toBe(1);
      expect(new Set(failures)).toEqual(new Set(['SESSION_FULL']));
      expect(await db.occupied(session)).toBe(1);
    }
  });

  it('never exceeds capacity 4 with many simultaneous requests', async () => {
    const session = await db.createSession({ date: '2026-11-11', start: '07:00', capacity: 4 });
    const members = await Promise.all(Array.from({ length: 16 }, () => db.createMember()));
    const outcomes = await Promise.all(members.map((m) => attempt(() => m.book(session))));
    expect(summarize(outcomes).successes).toBe(4);
    expect(await db.occupied(session)).toBe(4);
  });

  it('an admin assignment and a trainee booking race for the last spot: exactly one wins', async () => {
    const admin = await db.createAdmin();
    for (let round = 0; round < ROUNDS; round++) {
      const session = await db.createSession({ date: '2026-11-12', start: '07:00', capacity: 1 });
      const [a, b] = await Promise.all([db.createMember(), db.createMember()]);
      const outcomes = await Promise.all([
        attempt(() => a.book(session)),
        attempt(() => admin.call('admin_assign_booking', { p_session_id: session, p_member_id: b.userId })),
      ]);
      expect(summarize(outcomes).successes).toBe(1);
      expect(await db.occupied(session)).toBe(1);
    }
  });

  it('a spot freed by a cancellation is taken by exactly one of several waiting bookers', async () => {
    const session = await db.createSession({ date: '2026-11-13', start: '07:00', capacity: 1 });
    const holder = await db.createMember();
    const holding = await holder.book(session);
    const contenders = await Promise.all(Array.from({ length: 6 }, () => db.createMember()));
    const outcomes = await Promise.all([
      attempt(() => holder.cancel(holding)),
      ...contenders.map((c) => attempt(() => c.book(session))),
    ]);
    // The cancel always succeeds; at most one contender can end up with the single spot.
    expect(outcomes[0].ok).toBe(true);
    const contenderWins = outcomes.slice(1).filter((o) => o.ok).length;
    expect(contenderWins).toBeLessThanOrEqual(1);
    expect(await db.occupied(session)).toBe(contenderWins);
  });
});

describe('concurrent bookings - weekly allowance', () => {
  it('one trainee with one remaining session cannot book two different sessions at once', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const member = await db.createMember({ limit: 1 });
      const a = await db.createSession({ date: '2026-11-16', start: '07:00' });
      const b = await db.createSession({ date: '2026-11-17', start: '07:00' });
      const outcomes = await Promise.all([attempt(() => member.book(a)), attempt(() => member.book(b))]);
      const { successes, failures } = summarize(outcomes);
      expect(successes).toBe(1);
      expect(failures).toEqual(['NO_ALLOWANCE_REMAINING']);
      expect((await member.allowance('2026-11-15')).used).toBe(1);
    }
  });

  it('five parallel requests against a limit of two yield exactly two bookings', async () => {
    const member = await db.createMember({ limit: 2 });
    const sessions = await Promise.all(
      [16, 17, 18, 19, 20].map((d) => db.createSession({ date: `2026-11-${d}`, start: '07:00' })),
    );
    const outcomes = await Promise.all(sessions.map((s) => attempt(() => member.book(s))));
    expect(summarize(outcomes).successes).toBe(2);
    const n = await db.sql("select count(*)::int n from public.bookings where member_id = $1 and status = 'CONFIRMED'", [member.userId]);
    expect(n.rows[0].n).toBe(2);
  });

  it('double submission of the same booking creates a single booking', async () => {
    const member = await db.createMember({ limit: 3 });
    const session = await db.createSession({ date: '2026-11-23', start: '07:00' });
    const outcomes = await Promise.all([1, 2, 3, 4].map(() => attempt(() => member.book(session))));
    const { successes, failures } = summarize(outcomes);
    expect(successes).toBe(1);
    expect(new Set(failures)).toEqual(new Set(['ALREADY_BOOKED']));
  });

  it('two overlapping sessions requested at the same time: only one succeeds', async () => {
    const member = await db.createMember({ limit: 3 });
    const a = await db.createSession({ date: '2026-11-24', start: '07:00', end: '08:00' });
    const b = await db.createSession({ date: '2026-11-24', start: '07:30', end: '08:30' });
    const outcomes = await Promise.all([attempt(() => member.book(a)), attempt(() => member.book(b))]);
    const { successes, failures } = summarize(outcomes);
    expect(successes).toBe(1);
    expect(failures).toEqual(['OVERLAPPING_BOOKING']);
  });
});

describe('concurrent waiting-list promotion', () => {
  it('promoting two entries into one freed spot only succeeds once', async () => {
    const admin = await db.createAdmin();
    const session = await db.createSession({ date: '2026-11-25', start: '07:00', capacity: 1 });
    const holder = await db.createMember();
    const w1 = await db.createMember();
    const w2 = await db.createMember();
    const holding = await holder.book(session);
    const e1 = await w1.call<string>('join_waitlist', { p_session_id: session });
    const e2 = await w2.call<string>('join_waitlist', { p_session_id: session });
    await holder.cancel(holding);

    const outcomes = await Promise.all([
      attempt(() => admin.call('admin_promote_waitlist_entry', { p_entry_id: e1 })),
      attempt(() => admin.call('admin_promote_waitlist_entry', { p_entry_id: e2 })),
    ]);
    const { successes, failures } = summarize(outcomes);
    expect(successes).toBe(1);
    expect(failures).toEqual(['SESSION_FULL']);
    expect(await db.occupied(session)).toBe(1);
  });

  it('stress: many mixed operations never break invariants', async () => {
    const session = await db.createSession({ date: '2026-11-26', start: '07:00', capacity: 3 });
    const members: UserSession[] = await Promise.all(Array.from({ length: 12 }, () => db.createMember({ limit: 3 })));
    await Promise.all(members.map((m) => attempt(() => m.book(session))));
    const rows = await db.sql<{ id: string; member_id: string }>(
      "select id, member_id from public.bookings where session_id = $1 and status = 'CONFIRMED'",
      [session],
    );
    // everyone who holds a spot cancels while everyone else tries to book / join the waitlist at once
    const holders = new Map(rows.rows.map((r) => [r.member_id, r.id]));
    const ops = members.map((m) =>
      holders.has(m.userId)
        ? attempt(() => m.cancel(holders.get(m.userId)!))
        : attempt(() => m.book(session)),
    );
    await Promise.all(ops);
    const occupied = await db.occupied(session);
    expect(occupied).toBeLessThanOrEqual(3);
    const dup = await db.sql(
      `select member_id from public.bookings
       where session_id = $1 and status in ('CONFIRMED','ATTENDED','NO_SHOW')
       group by member_id having count(*) > 1`,
      [session],
    );
    expect(dup.rowCount).toBe(0);
  });
});
