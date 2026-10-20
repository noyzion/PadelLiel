import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface FilterChip {
  value: string;
  label: string;
  count?: number;
}

/** Link-based filter chips (server friendly): the selected chip is marked with aria-current. */
export function FilterChips({
  label,
  chips,
  selected,
  hrefFor,
}: {
  label: string;
  chips: FilterChip[];
  selected: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {chips.map((chip) => {
          const active = chip.value === selected;
          return (
            <li key={chip.value}>
              <Link
                href={hrefFor(chip.value)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-chip border px-4 text-small font-semibold transition-colors duration-150',
                  active
                    ? 'border-navy-900 bg-navy-900 text-white'
                    : 'border-line-strong bg-surface text-navy-900 hover:border-navy-900/50 hover:bg-navy-50 active:bg-navy-100',
                )}
              >
                {chip.label}
                {chip.count !== undefined ? (
                  <span className={cn('num rounded-chip px-1.5 text-caption', active ? 'bg-white/20' : 'bg-navy-100')}>{chip.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
