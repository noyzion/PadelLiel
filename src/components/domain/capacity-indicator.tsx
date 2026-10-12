import { cn } from '@/lib/cn';

/** Filled dots = taken spots. The text is the accessible source of truth; the dots are decoration. */
export function CapacityIndicator({
  taken,
  capacity,
  waiting = 0,
  compact = false,
}: {
  taken: number;
  capacity: number;
  waiting?: number;
  compact?: boolean;
}) {
  const free = Math.max(0, capacity - taken);
  const full = free === 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: Math.min(capacity, 12) }, (_, i) => (
          <span key={i} className={cn('size-2.5 rounded-full', i < taken ? 'bg-pink-500' : 'bg-pink-100')} />
        ))}
      </span>
      <span className={cn('text-small', full ? 'font-semibold text-pink-700' : 'text-muted')}>
        {full ? 'האימון מלא' : compact ? `${free} פנויים` : `נותרו ${free} מתוך ${capacity} מקומות`}
      </span>
      {waiting > 0 ? <span className="text-caption text-muted">{waiting} ממתינות</span> : null}
    </div>
  );
}
