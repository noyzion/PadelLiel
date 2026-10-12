import { nowMs } from '@/lib/now';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AssignForm, BackLink, Roster, SessionActions, Waitlist } from '@/components/admin/session-panels';
import { Badge, Card, PageHeader } from '@/components/ui/card';
import { SESSION_STATUS_LABEL_HE, SESSION_STATUS_TONE, levelLabel } from '@/lib/domain/labels';
import { formatDateHe, formatTimeRange } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { getSessionDetail } from '@/server/services/admin-sessions';
import { listAssignableMembers } from '@/server/services/admin-members';
import { getSkillLevels } from '@/server/services/settings';

export const metadata: Metadata = { title: 'פרטי אימון' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db } = await requireAdmin();

  const [detail, levels, members] = await Promise.all([getSessionDetail(db, id), getSkillLevels(db), listAssignableMembers(db)]);
  if (!detail) notFound();

  const { session, roster, waitlist } = detail;
  const occupied = roster.filter((r) => ['CONFIRMED', 'ATTENDED', 'NO_SHOW'].includes(r.status)).length;
  const isFull = occupied >= session.capacity;
  // Display-only hint; the database re-checks every transition.
  const hasStarted = new Date(session.starts_at).getTime() <= nowMs();
  const closed = session.status === 'CANCELLED' || session.status === 'COMPLETED';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink href={`/admin/schedule?week=${session.week_start}`}>חזרה ללוח האימונים</BackLink>
        <PageHeader title={`${formatDateHe(session.session_date)} · ${formatTimeRange(session.start_time, session.end_time)}`} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={SESSION_STATUS_TONE[session.status]}>{SESSION_STATUS_LABEL_HE[session.status]}</Badge>
          <Badge tone="blue">{levelLabel(session.skill_level_code, levels)}</Badge>
          <Badge tone={isFull ? 'rose' : 'green'}>
            {occupied} / {session.capacity}
          </Badge>
          {session.status === 'PUBLISHED' && !session.registration_open ? <Badge tone="amber">הרשמה סגורה</Badge> : null}
        </div>
        {session.notes ? <p className="mt-2 text-small text-muted">{session.notes}</p> : null}
      </div>

      <Card className="p-4">
        <SessionActions
          sessionId={session.id}
          status={session.status}
          registrationOpen={session.registration_open}
          hasStarted={hasStarted}
          weekStart={session.week_start}
          levels={levels}
          initial={{
            date: session.session_date,
            start: session.start_time.slice(0, 5),
            end: session.end_time.slice(0, 5),
            level: session.skill_level_code,
            capacity: session.capacity,
            registrationOpen: session.registration_open,
            notes: session.notes ?? '',
          }}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Roster roster={roster} hasStarted={hasStarted} levels={levels} />
          <Waitlist entries={waitlist} isFull={isFull} />
        </div>
        <div>
          <AssignForm
            sessionId={session.id}
            members={members}
            assignedIds={roster.filter((r) => ['CONFIRMED', 'ATTENDED', 'NO_SHOW'].includes(r.status)).map((r) => r.member_id)}
            isFull={isFull}
            levels={levels}
            disabled={closed || session.status === 'DRAFT'}
          />
          {session.status === 'DRAFT' ? <p className="mt-2 text-caption text-muted">אפשר לשבץ מתאמנות רק אחרי פרסום האימון.</p> : null}
        </div>
      </div>
    </div>
  );
}
