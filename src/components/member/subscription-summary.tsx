import { CalendarCheck } from 'lucide-react';
import { Alert, Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { Allowance } from '@/lib/domain/types';
import { formatHours, formatMonthHe } from '@/lib/time';

/** Segmented monthly usage: one segment per allowed session. Decorative; the text beside it says the same. */
export function MonthlyUsageProgress({ used, total }: { used: number; total: number }) {
  const segments = Math.max(1, Math.min(total, 31));
  const filled = Math.min(used, segments);
  return (
    <div className="flex gap-1" aria-hidden="true">
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={cn('h-2 flex-1 rounded-chip', i < filled ? 'bg-pink-500' : 'bg-pink-100')} />
      ))}
    </div>
  );
}

/** Pure display of the numbers computed by the database (`get_member_allowance`). */
export function SubscriptionSummary({
  allowance,
  title,
  cutoffHours = 8,
  tone = 'default',
}: {
  allowance: Allowance;
  title: string;
  cutoffHours?: number;
  tone?: 'default' | 'blue';
}) {
  const { effective_limit: limit, used, remaining } = allowance;

  if (!allowance.has_active_subscription) {
    return (
      <Card>
        <p className="text-small font-semibold text-muted">{title}</p>
        <Alert tone="amber" className="mt-3">
          אין לך מנוי פעיל לחודש הזה. פני לצוות שלנו כדי להפעיל מנוי.
        </Alert>
      </Card>
    );
  }

  return (
    <Card tone={tone} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-small font-semibold text-navy-900">{title}</p>
          <p className="text-caption text-muted">{formatMonthHe(allowance.month_start)}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-chip border border-pink-200 bg-pink-50 px-3 py-1 text-caption font-semibold text-pink-700">
          <CalendarCheck className="size-3.5" aria-hidden="true" />
          {allowance.plan_name}
        </span>
      </div>

      <div>
        <p className="text-small text-muted">אימונים בחודש הזה</p>
        <p className="num text-hero font-semibold leading-tight text-navy-900">
          {used} <span className="text-card font-medium text-muted">מתוך {limit}</span>
        </p>
      </div>

      <MonthlyUsageProgress used={used} total={limit} />

      {remaining === 0 ? (
        <p className="text-small text-muted">
          מימשת את מכסת האימונים החודשית שלך. ביטול של לפחות {formatHours(cutoffHours)} שעות לפני אימון יחזיר אותו למכסה.
        </p>
      ) : (
        <p className="text-small text-muted">
          נותרו לך <strong className="num font-semibold text-navy-900">{remaining}</strong> אימונים החודש. אפשר לחלק אותם לאורך החודש
          כרצונך.
        </p>
      )}
    </Card>
  );
}

/**
 * Compact quota tracker for the schedule page. It stays visible under the header while she scrolls
 * through sessions, with one bar per month the viewed week touches (a week can straddle two months).
 * Display only: eligibility of each session is decided by the database (`block_reason`).
 */
export function MonthlyQuotaTracker({ allowances }: { allowances: Allowance[] }) {
  const active = allowances.filter((a) => a.has_active_subscription);
  const inactive = allowances.filter((a) => !a.has_active_subscription);
  const several = allowances.length > 1;

  return (
    <div className="flex flex-col gap-3">
      {inactive.map((a) => (
        <Alert key={a.month_start} tone="amber" title={several ? `אין מנוי פעיל · ${formatMonthHe(a.month_start)}` : 'אין מנוי פעיל לחודש הזה'}>
          אפשר לראות את האימונים, אבל ההרשמה דורשת מנוי פעיל. פני לצוות שלנו.
        </Alert>
      ))}

      {active.length > 0 ? (
        <section
          aria-label="האימונים שלי החודש"
          className="sticky top-[4.5rem] z-20 flex flex-col gap-3 rounded-card border border-line bg-surface/95 p-3 shadow-soft backdrop-blur sm:flex-row sm:gap-6 sm:px-4"
        >
          {active.map((a) => (
            <div key={a.month_start} className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="truncate text-small font-semibold text-navy-900">{formatMonthHe(a.month_start)}</p>
                <p className="num whitespace-nowrap text-small text-muted">
                  <strong className="text-card font-semibold text-navy-900">{a.used}</strong> מתוך {a.effective_limit}
                  {a.remaining === 0 ? ' · המכסה מולאה' : ` · נותרו ${a.remaining}`}
                </p>
              </div>
              <MonthlyUsageProgress used={a.used} total={a.effective_limit} />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}