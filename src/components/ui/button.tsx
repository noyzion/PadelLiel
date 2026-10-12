import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { PadelRacket } from '@/components/brand';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

type Variant = 'primary' | 'accent' | 'secondary' | 'soft' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150 select-none ' +
  'disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-3';

const variants: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-700 active:bg-navy-800',
  accent: 'bg-pink-700 text-white hover:bg-pink-700/90 active:bg-pink-700',
  secondary: 'border border-navy-900/25 bg-surface text-navy-900 hover:border-navy-900/50 hover:bg-navy-50 active:bg-navy-100',
  soft: 'bg-pink-100 text-pink-700 hover:bg-pink-200',
  ghost: 'text-navy-900 hover:bg-navy-50 active:bg-navy-100',
  danger: 'bg-danger text-white hover:bg-danger-strong',
};

// Touch targets: every size is at least 44px tall except `sm`, which is only used in dense admin rows.
const sizes: Record<Size, string> = {
  sm: 'min-h-10 px-4 text-small',
  md: 'min-h-12 px-5 text-body',
  lg: 'min-h-14 px-6 text-body',
};

/**
 * Optional racket flourish for wide call-to-action buttons. Each placement tilts the racket a
 * different way so the buttons feel hand-placed rather than stamped. Use on full-width, filled
 * buttons only (primary / accent); it is cropped by the button edge and never covers the label.
 */
export type RacketPlacement = 'end' | 'start' | 'corner';

const racketPlacements: Record<RacketPlacement, { racket: string; ball: string | null }> = {
  end: {
    racket: 'end-4 -bottom-3 h-[4.5rem] -rotate-[32deg] group-hover:-rotate-[22deg] group-focus-visible:-rotate-[22deg] group-active:-rotate-[10deg] group-active:scale-110',
    ball: 'end-[4.6rem] top-2.5',
  },
  start: {
    racket: 'start-4 -bottom-3 h-[4.5rem] rotate-[32deg] group-hover:rotate-[22deg] group-focus-visible:rotate-[22deg] group-active:rotate-[10deg] group-active:scale-110',
    ball: 'start-[4.6rem] top-2.5',
  },
  corner: {
    racket: 'end-2 -bottom-7 h-24 -rotate-[48deg] group-hover:-rotate-[38deg] group-focus-visible:-rotate-[38deg] group-active:-rotate-[26deg] group-active:scale-110',
    ball: null,
  },
};

const racketColors: Partial<Record<Variant, { racket: string; ball: string }>> = {
  primary: { racket: 'text-pink-200', ball: 'bg-pink-500' },
  accent: { racket: 'text-white/80', ball: 'bg-white/70' },
};

function RacketFlourish({ variant, placement }: { variant: Variant; placement: RacketPlacement }) {
  const colors = racketColors[variant];
  if (!colors) return null;
  const p = racketPlacements[placement];
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      <PadelRacket className={cn('absolute transition-transform duration-300', p.racket, colors.racket)} />
      {p.ball ? <span className={cn('absolute size-3 rounded-full', p.ball, colors.ball)} /> : null}
    </span>
  );
}

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string, racket?: boolean) {
  return cn(base, variants[variant], sizes[size], racket && 'group relative overflow-hidden', className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  racket?: RacketPlacement;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, racket, className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className, Boolean(racket))}
    >
      {racket ? <RacketFlourish variant={variant} placement={racket} /> : null}
      {loading ? <Spinner className="relative size-4" /> : null}
      {racket ? <span className="relative">{children}</span> : children}
    </button>
  );
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
  racket?: RacketPlacement;
}

export function ButtonLink({ variant = 'primary', size = 'md', racket, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link {...props} className={buttonClasses(variant, size, className, Boolean(racket))}>
      {racket ? <RacketFlourish variant={variant} placement={racket} /> : null}
      {racket ? <span className="relative">{children}</span> : children}
    </Link>
  );
}