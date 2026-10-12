import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { formatWeekRangeHe, shiftWeek } from '@/lib/time';

/** Previous / next week navigation driven by the `?week=` query parameter. RTL: "previous" points right. */
export function WeekNav({
  basePath,
  weekStart,
  currentWeek,
  extraQuery,
}: {
  basePath: string;
  weekStart: string;
  currentWeek: string;
  extraQuery?: Record<string, string>;
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
      <Link href={href(shiftWeek(weekStart, -1))} className={arrow} aria-label="שבוע קודם">
        <ChevronRight className="size-6" aria-hidden="true" />
      </Link>
      <div className="min-w-0 text-center">
        <p className="num truncate text-body font-bold text-navy-900">{formatWeekRangeHe(weekStart)}</p>
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
      <Link href={href(shiftWeek(weekStart, 1))} className={arrow} aria-label="שבוע הבא">
        <ChevronLeft className="size-6" aria-hidden="true" />
      </Link>
    </nav>
  );
}
