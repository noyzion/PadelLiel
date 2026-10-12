import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { formatWeekRangeHe, shiftWeek } from '@/lib/time';

/**
 * Previous / next week navigation driven by the `?week=` query parameter. RTL: "previous" points right.
 * `canGoPrev` / `canGoNext` hide an arrow when there is nowhere to go (members only see this week
 * and, once it is published, next week).
 */
export function WeekNav({
  basePath,
  weekStart,
  currentWeek,
  extraQuery,
  canGoPrev = true,
  canGoNext = true,
}: {
  basePath: string;
  weekStart: string;
  currentWeek: string;
  extraQuery?: Record<string, string>;
  canGoPrev?: boolean;
  canGoNext?: boolean;
}) {
  const href = (week: string) => {
    const params = new URLSearchParams({ ...extraQuery, week });
    return `${basePath}?${params.toString()}`;
  };
  const isCurrent = weekStart === currentWeek;
  const isNext = weekStart === shiftWeek(currentWeek, 1);
  const arrow =
    'grid size-12 shrink-0 place-items-center rounded-control text-navy-900 transition-colors duration-150 hover:bg-navy-50 active:bg-navy-100';

  return (
    <nav
      aria-label="ניווט בין שבועות"
      className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface p-1.5 shadow-soft"
    >
      {canGoPrev ? (
        <Link href={href(shiftWeek(weekStart, -1))} className={arrow} aria-label="שבוע קודם">
          <ChevronRight className="size-6" aria-hidden="true" />
        </Link>
      ) : (
        <span className="size-12 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 text-center">
        <p className="num truncate text-body font-semibold text-navy-900">{formatWeekRangeHe(weekStart)}</p>
        <p className="text-caption text-muted">
          {isCurrent ? (
            'השבוע'
          ) : isNext ? (
            'שבוע הבא'
          ) : (
            <Link href={href(currentWeek)} className="font-semibold text-ocean-700 underline underline-offset-4">
              חזרה להשבוע
            </Link>
          )}
        </p>
      </div>
      {canGoNext ? (
        <Link href={href(shiftWeek(weekStart, 1))} className={arrow} aria-label="שבוע הבא">
          <ChevronLeft className="size-6" aria-hidden="true" />
        </Link>
      ) : (
        <span className="size-12 shrink-0" aria-hidden="true" />
      )}
    </nav>
  );
}
