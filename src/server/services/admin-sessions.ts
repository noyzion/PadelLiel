import 'server-only';
import type { Db } from '@/lib/supabase/server';
import type { BookingStatus, Profile, SessionRow, WaitlistStatus } from '@/lib/domain/types';
import type { NewSessionRow } from '@/lib/domain/schedule-generator';
import { embedded, rpc, unwrap } from '../rpc';

export interface SessionFormValues {
  date: string;
  start: string;
  end: string;
  level: string;
  capacity: number;
  registrationOpen: boolean;
  notes?: string;
}

export async function createSessions(db: Db, rows: NewSessionRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const created = unwrap(await db.from('sessions').insert(rows).select('id')) as { id: string }[];
  return created.length;
}

export async function createSession(db: Db, form: SessionFormValues): Promise<string> {
  const created = unwrap(
    await db
      .from('sessions')
      .insert({
        session_date: form.date,
        start_time: form.start,
        end_time: form.end,
        skill_level_code: form.level,
        capacity: form.capacity,
        registration_open: form.registrationOpen,
        notes: form.notes ?? null,
        status: 'DRAFT',
      })
      .select('id')
      .single(),
  ) as { id: string };
  return created.id;
}

/** Edits a session. The database trigger guards bookings (week moves, overlaps, capacity). */
export async function updateSession(db: Db, sessionId: string, form: SessionFormValues) {
  unwrap(
    await db
      .from('sessions')
      .update({
        session_date: form.date,
        start_time: form.start,
        end_time: form.end,
        skill_level_code: form.level,
        capacity: form.capacity,
        registration_open: form.registrationOpen,
        notes: form.notes ?? null,
      })
      .eq('id', sessionId)
      .select('id')
      .single(),
  );
}

export async function deleteDraftSession(db: Db, sessionId: string) {
  unwrap(await db.from('sessions').delete().eq('id', sessionId).eq('status', 'DRAFT').select('id').single());
}

export function publishSessions(db: Db, sessionIds: string[]) {
  return rpc<number>(db, 'admin_publish_sessions', { p_session_ids: sessionIds });
}

export async function cancelSession(db: Db, sessionId: string, reason?: string) {
  await rpc<null>(db, 'admin_cancel_session', { p_session_id: sessionId, p_reason: reason ?? null });
}

export async function completeSession(db: Db, sessionId: string) {
  await rpc<null>(db, 'admin_complete_session', { p_session_id: sessionId });
}

export function duplicateWeek(db: Db, fromWeek: string, toWeek: string) {
  return rpc<number>(db, 'admin_duplicate_week', { p_from_week: fromWeek, p_to_week: toWeek });
}

export async function setRegistrationOpen(db: Db, sessionId: string, open: boolean) {
  unwrap(await db.from('sessions').update({ registration_open: open }).eq('id', sessionId).select('id').single());
}

export interface RosterEntry {
  booking_id: string;
  member_id: string;
  status: BookingStatus;
  booked_at: string;
  cancelled_at: string | null;
  skill_override: boolean;
  admin_note: string | null;
  member: Pick<Profile, 'id' | 'full_name' | 'phone' | 'skill_level_code'> | null;
}

export interface WaitlistRow {
  entry_id: string;
  member_id: string;
  status: WaitlistStatus;
  joined_at: string;
  position: number | null;
  member: Pick<Profile, 'id' | 'full_name' | 'phone' | 'skill_level_code'> | null;
}

export interface SessionDetail {
  session: SessionRow;
  roster: RosterEntry[];
  waitlist: WaitlistRow[];
}

const SESSION_COLUMNS =
  'id, session_date, start_time, end_time, starts_at, ends_at, week_start, skill_level_code, capacity, status, registration_open, notes, cancel_reason';
const ROSTER_COLUMNS =
  'id, member_id, status, booked_at, cancelled_at, skill_override, admin_note, profiles!bookings_member_id_fkey(id, full_name, phone, skill_level_code)';
const WAITLIST_COLUMNS =
  'id, member_id, status, joined_at, profiles!waitlist_entries_member_id_fkey(id, full_name, phone, skill_level_code)';

export async function getSessionDetail(db: Db, sessionId: string): Promise<SessionDetail | null> {
  const [sessionRes, bookingsRes, entriesRes] = await Promise.all([
    db.from('sessions').select(SESSION_COLUMNS).eq('id', sessionId).maybeSingle(),
    db.from('bookings').select(ROSTER_COLUMNS).eq('session_id', sessionId).order('created_at'),
    db.from('waitlist_entries').select(WAITLIST_COLUMNS).eq('session_id', sessionId).order('joined_at'),
  ]);
  const session = unwrap(sessionRes) as SessionRow | null;
  if (!session) return null;

  const bookings = unwrap(bookingsRes) as unknown as (Omit<RosterEntry, 'booking_id' | 'member'> & {
    id: string;
    profiles: RosterEntry['member'] | NonNullable<RosterEntry['member']>[] | null;
  })[];
  const entries = unwrap(entriesRes) as unknown as {
    id: string;
    member_id: string;
    status: WaitlistStatus;
    joined_at: string;
    profiles: RosterEntry['member'] | NonNullable<RosterEntry['member']>[] | null;
  }[];

  let position = 0;
  return {
    session,
    roster: bookings.map((b) => ({
      booking_id: b.id,
      member_id: b.member_id,
      status: b.status,
      booked_at: b.booked_at,
      cancelled_at: b.cancelled_at,
      skill_override: b.skill_override,
      admin_note: b.admin_note,
      member: embedded(b.profiles),
    })),
    waitlist: entries.map((e) => ({
      entry_id: e.id,
      member_id: e.member_id,
      status: e.status,
      joined_at: e.joined_at,
      position: e.status === 'WAITING' ? ++position : null,
      member: embedded(e.profiles),
    })),
  };
}
