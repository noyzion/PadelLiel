import 'server-only';
import type { Db } from '@/lib/supabase/server';
import type { BookingStatus, Profile, SessionRow, WaitlistStatus } from '@/lib/domain/types';
import type { NewSessionRow } from '@/lib/domain/schedule-generator';
import { rpc, unwrap } from '../rpc';

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

const MEMBER_COLUMNS = 'id, full_name, phone, skill_level_code';

export async function getSessionDetail(db: Db, sessionId: string): Promise<SessionDetail | null> {
  const session = unwrap(await db.from('sessions').select('*').eq('id', sessionId).maybeSingle()) as SessionRow | null;
  if (!session) return null;

  const bookings = unwrap(
    await db.from('bookings').select('*').eq('session_id', sessionId).order('created_at'),
  ) as (Omit<RosterEntry, 'booking_id' | 'member'> & { id: string })[];
  const entries = unwrap(
    await db.from('waitlist_entries').select('*').eq('session_id', sessionId).order('joined_at'),
  ) as { id: string; member_id: string; status: WaitlistStatus; joined_at: string }[];

  const memberIds = [...new Set([...bookings.map((b) => b.member_id), ...entries.map((e) => e.member_id)])];
  const members = memberIds.length
    ? (unwrap(await db.from('profiles').select(MEMBER_COLUMNS).in('id', memberIds)) as NonNullable<RosterEntry['member']>[])
    : [];
  const byId = new Map(members.map((m) => [m.id, m]));

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
      member: byId.get(b.member_id) ?? null,
    })),
    waitlist: entries.map((e) => ({
      entry_id: e.id,
      member_id: e.member_id,
      status: e.status,
      joined_at: e.joined_at,
      position: e.status === 'WAITING' ? ++position : null,
      member: byId.get(e.member_id) ?? null,
    })),
  };
}
