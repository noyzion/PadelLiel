import { cn } from '@/lib/cn';

/** Placeholder block shown while a route loads. Purely visual; the route's loading wrapper announces "טוען". */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-shimmer rounded-control bg-navy-100', className)} />;
}

export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-soft">
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-1/2' : 'w-full')} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5">
      <span className="sr-only">טוען…</span>
      <Skeleton className="h-9 w-2/5" />
      <CardSkeleton lines={3} />
      <div className="grid gap-3 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
