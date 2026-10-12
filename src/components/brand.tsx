import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { COMMUNITY_NAME, VENUE_LOGO, VENUE_SHORT } from '@/lib/brand';

const LOGO_SIZES = { sm: 'size-10', md: 'size-14', lg: 'size-24' } as const;

/**
 * Israel Tennis Centers emblem (original file, unaltered) - the only graphic mark in the UI.
 * The round emblem sits on an off-white square, so it is cropped to a circle with CSS only.
 */
export function VenueLogo({ size = 'md', className }: { size?: keyof typeof LOGO_SIZES; className?: string }) {
  if (!VENUE_LOGO) return null;
  return (
    <span className={cn('relative block shrink-0 overflow-hidden rounded-full bg-navy-900', LOGO_SIZES[size], className)}>
      <Image
        src={VENUE_LOGO.src}
        width={VENUE_LOGO.width}
        height={VENUE_LOGO.height}
        alt={VENUE_LOGO.alt}
        sizes="96px"
        className="size-full scale-[1.05] object-cover"
        priority={size === 'lg'}
      />
    </span>
  );
}

/** Logo plus wordmark. `stacked` centres everything (auth screens). */
export function Brand({
  href = '/',
  stacked = false,
  className,
}: {
  href?: string;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn('inline-flex items-center gap-3 rounded-control', stacked && 'flex-col gap-5 text-center', className)}
    >
      <VenueLogo size={stacked ? 'lg' : 'sm'} />
      <span className={cn('flex flex-col', stacked ? 'items-center gap-1' : 'leading-tight')}>
        <span className={cn('font-semibold text-navy-900', stacked ? 'text-hero tracking-tight' : 'text-body')}>{COMMUNITY_NAME}</span>
        <span className={cn('text-muted', stacked ? 'text-body tracking-[0.12em]' : 'text-caption tracking-wide')}>{VENUE_SHORT}</span>
      </span>
    </Link>
  );
}
