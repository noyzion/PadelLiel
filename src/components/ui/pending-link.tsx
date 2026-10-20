'use client';

import Link, { useLinkStatus } from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

/** Inline spinner for text / button links. Must be rendered inside a `next/link`. */
export function LinkBusyInline({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className={cn('size-4 shrink-0', className)} />;
}

/** Full-card overlay. Must be rendered inside a `next/link`. */
function LinkBusyOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span className="sr-only">טוען…</span>
      <span aria-hidden="true" className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-surface/70">
        <Spinner className="size-6 text-navy-900" />
      </span>
    </>
  );
}

/**
 * `next/link` with an immediate pending indicator. Use `overlay` on cards and `inline` on name links.
 */
export function PendingLink({
  className,
  children,
  indicator = 'overlay',
  ...props
}: ComponentProps<typeof Link> & { indicator?: 'overlay' | 'inline' }) {
  return (
    <Link {...props} className={cn(indicator === 'overlay' && 'relative', className)}>
      {children}
      {indicator === 'inline' ? <LinkBusyInline /> : <LinkBusyOverlay />}
    </Link>
  );
}
