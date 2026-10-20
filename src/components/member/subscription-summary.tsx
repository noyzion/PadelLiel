import { CalendarCheck } from 'lucide-react';
import { Alert, Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { Allowance } from '@/lib/domain/types';
import { formatHours, formatMonthCycleHe, formatMonthHe } from '@/lib/time';

/** Segmented monthly usage: one segment per allowed session. Decorative; the text beside it says the same. */
export function MonthlyUsageProgress({ used, total }: { used: number; total: number }) {
  const segments = Math.max(1, Math.min(total, 31));
  const filled = Math.min(used, segments);
  return (
    <div className="flex gap-1" aria-hidden="true">
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={cn('h-2 flex-1 rounded-chip', i < filled ? 'bg-navy-900' : 'bg-navy-100')} />
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
        {allowance.trial_available ? (
          <Alert tone="blue" className="mt-3" title="אימון ניסיון">
            יש לך אימון אחד בחינם. בחרי אותו בלוח האימונים, באיזה מועד שתרצי. אם אחר כך תעברי למנוי, האימון הזה לא ירד מהמכסה החודשית.
          </Alert>
        ) : (
          <Alert tone="amber" className="mt-3">
            אין לך מנוי פעיל לחודש הזה. פני לצוות שלנו כדי להפעיל מנוי.
          </Alert>
        )}
      </Card>
    );
  }

  return (
    <Card tone={tone} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-small font-semibold text-navy-900">{title}</p>
          <p className="text-caption text-muted">
            {formatMonthHe(allowance.month_start)} · {formatMonthCycleHe(allowance.month_start)}
          </p>
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
