import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
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

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({ variant = 'primary', size = 'md', className, ...props }: ButtonLinkProps) {
  return <Link {...props} className={buttonClasses(variant, size, className)} />;
}