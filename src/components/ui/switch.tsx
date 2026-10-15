'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A labelled on/off setting. The label and description are the accessible name/description of the switch, the whole
 * row is the touch target (>= 44px) and the knob moves with the reading direction (right = off in RTL).
 */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex min-h-14 items-center justify-between gap-4 py-2', className)}>
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-body font-semibold text-navy-900">
          {label}
        </p>
        {description ? (
          <p id={`${id}-desc`} className="text-caption text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-150 focus-visible:outline-3 disabled:cursor-not-allowed disabled:opacity-55',
          checked ? 'justify-end border-navy-900 bg-navy-900' : 'justify-start border-control bg-navy-50',
        )}
      >
        <span className={cn('block size-6 rounded-full shadow-soft transition-colors duration-150', checked ? 'bg-white' : 'bg-navy-900/40')} />
      </button>
    </div>
  );
}
