import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { SkillLevelBadge } from '@/components/domain/badges';
import type { ScheduleSession } from '@/lib/domain/types';
import { formatDateHe, formatTimeRange } from '@/lib/time';

/** Compact, linked teaser for a bookable session. Booking itself happens on the schedule page. */
export function SessionPreview({ session, levelLabel, href }: { session: ScheduleSession; levelLabel: string; href: string }) {
  const free = Math.max(0, session.capacity - session.occupied_count);
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-soft transition-colors duration-150 hover:border-navy-900/40"
    >
      <div className="min-w-0">
        <p className="num text-card font-semibold text-navy-900">
          <bdi>{formatTimeRange(session.start_time, session.end_time)}</bdi>
        </p>
        <p className="text-small text-muted">
          {formatDateHe(session.session_date)} · נותרו {free} מתוך {session.capacity} מקומות
        </p>
      </div>
      <div className="flex items-center gap-2">
        <SkillLevelBadge label={levelLabel} />
        <ChevronLeft className="size-5 text-muted transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  );
}
