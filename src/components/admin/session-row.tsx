import Link from 'next/link';
import { SessionStatusBadge, SkillLevelBadge } from '@/components/domain/badges';
import { Badge, ProgressBar } from '@/components/ui/card';
import type { ScheduleSession } from '@/lib/domain/types';
import { formatDateHe, formatTimeRange } from '@/lib/time';

/** One session in an admin list: links to the session detail page. */
export function SessionRow({
  session,
  levelLabel,
  showDate = true,
}: {
  session: ScheduleSession;
  levelLabel: string;
  showDate?: boolean;
}) {
  const full = session.occupied_count >= session.capacity;
  return (
    <Link
      href={`/admin/sessions/${session.id}`}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-soft transition-colors duration-150 hover:border-navy-900/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="num text-card font-bold text-navy-900">
            <bdi>{formatTimeRange(session.start_time, session.end_time)}</bdi>
          </p>
          {showDate ? <p className="text-small text-muted">{formatDateHe(session.session_date)}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <SkillLevelBadge label={levelLabel} />
          {session.status !== 'PUBLISHED' ? <SessionStatusBadge status={session.status} /> : null}
          {session.status === 'PUBLISHED' && full ? <Badge tone="rose">מלא</Badge> : null}
          {session.status === 'PUBLISHED' && !session.registration_open ? <Badge tone="amber">הרשמה סגורה</Badge> : null}
        </div>
      </div>
      {session.status !== 'CANCELLED' ? (
        <>
          <ProgressBar value={session.occupied_count} max={session.capacity} label="תפוסה" />
          <div className="flex justify-between text-caption text-muted">
            <span className="num">
              {session.occupied_count} / {session.capacity} רשומות
            </span>
            <span className="num">
              {session.waitlist_count > 0 ? `${session.waitlist_count} בהמתנה · ` : ''}
              {Math.max(0, session.capacity - session.occupied_count)} פנויים
            </span>
          </div>
        </>
      ) : null}
    </Link>
  );
}
