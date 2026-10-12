import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

// Return DATE / TIME as plain strings (no JS timezone surprises).
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1083, (v) => v);

/** Thursday 09:00 Israel time (UTC+2 after DST ended on 2026-10-25). Week of Sun 2026-10-25. */
export const BASE_NOW = '2026-10-29T07:00:00Z';
export const THIS_WEEK = '2026-10-25';
export const NEXT_WEEK = '2026-11-01';
/** First day of the month of BASE_NOW / of the following month. */
export const THIS_MONTH = '2026-10-01';
export const NEXT_MONTH = '2026-11-01';

export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface SessionInput {
  date: string; // YYYY-MM-DD (Israel local date)
  start?: string; // HH:MM
  end?: string; // HH:MM
  level?: Level;
  capacity?: number;
  status?: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
  registrationOpen?: boolean;
}

export interface MemberInput {
  name?: string;
  approved?: boolean;
  level?: Level | null;
  /** monthly session limit of the plan to subscribe to; null = no subscription */
  limit?: number | null;
  subscriptionActive?: boolean;
  startsOn?: string;
  endsOn?: string | null;
}

/** Runs SQL as an authenticated Supabase-like user (role `authenticated`, JWT sub = userId). */
export class UserSession {
  constructor(
    private readonly db: TestDb,
    readonly userId: string,
  ) {}

  async query<T extends pg.QueryResultRow = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<pg.QueryResult<T>> {
    const client = await this.db.pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [this.userId]);
      const result = await client.query<T>(text, params);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Calls `select * from public.<fn>(named => $n, ...)` and returns all rows. */
  async rpc<T extends pg.QueryResultRow = Record<string, unknown>>(
    fn: string,
    args: Record<string, unknown> = {},
  ): Promise<T[]> {
    const keys = Object.keys(args);
    const list = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const result = await this.query<T>(`select * from public.${fn}(${list})`, keys.map((k) => args[k]));
    return result.rows;
  }

  /** For scalar-returning functions: returns the single value. */
  async call<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const rows = await this.rpc(fn, args);
    return rows[0]?.[fn] as T;
  }

  book(sessionId: string, ack = false) {
    return this.call<string>('book_session', { p_session_id: sessionId, p_ack_late_policy: ack });
  }

  cancel(bookingId: string, confirmLate = false) {
    return this.call<{
      booking_id: string;
      status: string;
      allowance_restored: boolean;
      cancellation_deadline: string;
    }>('cancel_booking', { p_booking_id: bookingId, p_confirm_late: confirmLate });
  }

  async allowance(monthStart: string) {
    const rows = await this.rpc<{
      effective_limit: number;
      used: number;
      remaining: number;
      plan_limit: number;
      adjustments: number;
      has_active_subscription: boolean;
    }>('get_member_allowance', { p_member_id: this.userId, p_month_start: monthStart });
    return rows[0];
  }
}

export class TestDb {
  readonly pool: pg.Pool;

  private constructor(
    private readonly name: string,
    private readonly adminPool: pg.Pool,
    pool: pg.Pool,
  ) {
    this.pool = pool;
  }

  static async create(): Promise<TestDb> {
    const info = inject('pg');
    const name = `t_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const adminPool = new pg.Pool({ ...info, database: 'postgres', max: 2 });
    await adminPool.query(`create database ${name} template ${info.templateDb}`);
    const pool = new pg.Pool({ ...info, database: name, max: 30 });
    const db = new TestDb(name, adminPool, pool);
    await db.setNow(BASE_NOW);
    // Production allows a single session at a time (one court). Most fixtures here deliberately put
    // many sessions on the same date/time, so the guard is off by default and opted into per test file.
    await db.setSingleCourt(false);
    return db;
  }

  /** Turns the "one court, no overlapping sessions" trigger on or off for this test database. */
  async setSingleCourt(enforced: boolean) {
    await this.sql(`alter table public.sessions ${enforced ? 'enable' : 'disable'} trigger sessions_single_court`);
  }

  async close() {
    await this.pool.end();
    await this.adminPool.query(`drop database if exists ${this.name} with (force)`);
    await this.adminPool.end();
  }

  /** Superuser query (bypasses RLS) â€” for fixtures and assertions. */
  sql<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []) {
    return this.pool.query<T>(text, params);
  }

  /** Sets the application clock (`app_now()`); pass null to use the real clock. */
  async setNow(iso: string | null) {
    await this.sql('delete from public.test_clock');
    if (iso) await this.sql('insert into public.test_clock (now_at) values ($1)', [iso]);
  }

  as(userId: string) {
    return new UserSession(this, userId);
  }

  async createAdmin(name = 'Admin'): Promise<UserSession> {
    const id = await this.insertUser(name);
    await this.sql("update public.profiles set role = 'admin', approval_status = 'approved' where id = $1", [id]);
    return this.as(id);
  }

  private async insertUser(name: string): Promise<string> {
    const id = randomUUID();
    await this.sql('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
      id,
      `${id.slice(0, 8)}@example.com`,
      JSON.stringify({ full_name: name, phone: '050-0000000' }),
    ]);
    return id;
  }

  /** Creates an approved, levelled, subscribed trainee by default. */
  async createMember(input: MemberInput = {}): Promise<UserSession> {
    const { approved = true, level = 'intermediate', limit = 2, subscriptionActive = true } = input;
    const id = await this.insertUser(input.name ?? 'Member');
    await this.sql('update public.profiles set approval_status = $2, skill_level_code = $3 where id = $1', [
      id,
      approved ? 'approved' : 'pending',
      level,
    ]);
    if (limit !== null) {
      await this.subscribe(id, limit, {
        active: subscriptionActive,
        startsOn: input.startsOn,
        endsOn: input.endsOn ?? null,
      });
    }
    return this.as(id);
  }

  async planIdForLimit(limit: number): Promise<string> {
    const found = await this.sql<{ id: string }>(
      'select id from public.subscription_plans where monthly_session_limit = $1 order by created_at limit 1',
      [limit],
    );
    if (found.rows[0]) return found.rows[0].id;
    const created = await this.sql<{ id: string }>(
      'insert into public.subscription_plans (name, monthly_session_limit) values ($1, $2) returning id',
      [`plan-${limit}`, limit],
    );
    return created.rows[0].id;
  }

  async subscribe(
    memberId: string,
    limit: number,
    opts: { active?: boolean; startsOn?: string; endsOn?: string | null } = {},
  ) {
    const plan = await this.planIdForLimit(limit);
    const res = await this.sql<{ id: string }>(
      `insert into public.member_subscriptions (member_id, plan_id, is_active, starts_on, ends_on)
       values ($1, $2, $3, $4, $5) returning id`,
      [memberId, plan, opts.active ?? true, opts.startsOn ?? '2026-01-01', opts.endsOn ?? null],
    );
    return res.rows[0].id;
  }

  async createSession(input: SessionInput): Promise<string> {
    const res = await this.sql<{ id: string }>(
      `insert into public.sessions
         (session_date, start_time, end_time, skill_level_code, capacity, status, registration_open)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        input.date,
        input.start ?? '07:00',
        input.end ?? '08:00',
        input.level ?? 'intermediate',
        input.capacity ?? 4,
        input.status ?? 'PUBLISHED',
        input.registrationOpen ?? true,
      ],
    );
    return res.rows[0].id;
  }

  async bookingStatus(bookingId: string): Promise<string> {
    const r = await this.sql<{ status: string }>('select status from public.bookings where id = $1', [bookingId]);
    return r.rows[0].status;
  }

  async occupied(sessionId: string): Promise<number> {
    const r = await this.sql<{ n: number }>(
      `select count(*)::int as n from public.bookings
       where session_id = $1 and status in ('CONFIRMED','ATTENDED','NO_SHOW')`,
      [sessionId],
    );
    return r.rows[0].n;
  }
}
