import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { PadelRackets } from '@/components/brand';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/domain/labels';

/* ------------------------------------------------------------------ */
/* Card                                                                 */
/* ------------------------------------------------------------------ */

type CardTone = 'default' | 'pink' | 'blue';

const cardTones: Record<CardTone, string> = {
  default: 'border-line bg-surface',
  pink: 'border-pink-200 bg-pink-50',
  blue: 'border-ocean-100 bg-ocean-50',
};

export function Card({ className, tone = 'default', ...props }: HTMLAttributes<HTMLDivElement> & { tone?: CardTone }) {
  return <div {...props} className={cn('rounded-card border p-5 shadow-soft', cardTones[tone], className)} />;
}

/* ------------------------------------------------------------------ */
/* Badge (status / level). Always carries text, never colour alone.     */
/* ------------------------------------------------------------------ */

const badgeTones: Record<Tone, string> = {
  neutral: 'border-line bg-canvas text-muted',
  rose: 'border-pink-200 bg-pink-100 text-pink-700',
  green: 'border-success-line bg-success-soft text-success',
  amber: 'border-warning-line bg-warning-soft text-warning',
  red: 'border-danger-line bg-danger-soft text-danger',
  blue: 'border-ocean-100 bg-ocean-50 text-ocean-700',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-chip border px-2.5 py-0.5 text-caption font-semibold',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Alert                                                                */
/* ------------------------------------------------------------------ */

const alertTones: Record<Tone, string> = {
  neutral: 'border-line bg-canvas text-ink',
  rose: 'border-pink-200 bg-pink-50 text-ink',
  green: 'border-success-line bg-success-soft text-ink',
  amber: 'border-warning-line bg-warning-soft text-ink',
  red: 'border-danger-line bg-danger-soft text-ink',
  blue: 'border-ocean-100 bg-ocean-50 text-ink',
};

const alertIconTones: Record<Tone, string> = {
  neutral: 'text-muted',
  rose: 'text-pink-700',
  green: 'text-success',
  amber: 'text-warning',
  red: 'text-danger',
  blue: 'text-ocean-700',
};

const alertIcons = {
  neutral: Info,
  rose: Info,
  green: CircleCheck,
  amber: TriangleAlert,
  red: OctagonAlert,
  blue: Info,
} as const;

export function Alert({
  tone = 'neutral',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = alertIcons[tone];
  return (
    <div
      role={tone === 'red' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-control border px-4 py-3 text-small', alertTones[tone], className)}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', alertIconTones[tone])} aria-hidden="true" />
      <div className="min-w-0 leading-relaxed">
        {title ? <p className="font-semibold text-navy-900">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty / page header / stat / progress                                */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <PadelRackets className="mb-2 w-20 text-pink-200" />
      <p className="text-card font-semibold text-navy-900">{title}</p>
      {description ? <p className="max-w-sm text-small text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-caption font-semibold text-pink-700">{eyebrow}</p> : null}
        <h1 className="text-title font-semibold tracking-tight sm:text-hero">{title}</h1>
        {description ? <p className="mt-1 text-small text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeading({ id, children, count }: { id?: string; children: ReactNode; count?: number }) {
  return (
    <h2 id={id} className="text-card font-semibold">
      {children}
      {count !== undefined ? <span className="ms-2 text-small font-medium text-muted">({count})</span> : null}
    </h2>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'rose';
}) {
  return (
    <div className={cn('rounded-2xl border p-4', tone === 'rose' ? 'border-pink-200 bg-pink-100' : 'border-line bg-surface')}>
      <p className="text-caption font-medium text-muted">{label}</p>
      <p className="num mt-1 text-hero font-semibold leading-none text-navy-900">{value}</p>
      {hint ? <p className="mt-1.5 text-caption text-muted">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className="h-2.5 w-full overflow-hidden rounded-chip bg-navy-100"
    >
      <div className="h-full rounded-chip bg-navy-900 transition-[width] duration-200" style={{ width: `${percent}%` }} />
    </div>
  );
}
