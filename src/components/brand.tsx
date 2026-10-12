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

/** One racket, drawn upright with its grip crossing point at (0,0). Head dots follow a staggered grid. */
function Racket() {
  const cy = -58;
  const rx = 31;
  const ry = 42;
  const dots: { x: number; y: number }[] = [];
  for (let row = 0, y = cy - ry + 12; y <= cy + ry - 14; row += 1, y += 8) {
    for (let x = -rx + 10 + (row % 2) * 4; x <= rx - 9; x += 8) {
      if ((x / (rx - 8)) ** 2 + ((y - cy) / (ry - 9)) ** 2 <= 1) dots.push({ x, y });
    }
  }
  return (
    <g>
      <rect x="-5.5" y="-18" width="11" height="52" rx="3.5" fill="currentColor" />
      <rect x="-6.5" y="2" width="13" height="30" rx="3" fill="currentColor" />
      <path d="M-6.5 10h13M-6.5 17h13M-6.5 24h13" stroke="var(--color-surface)" strokeWidth="1.4" />
      <ellipse cx="0" cy={cy} rx={rx} ry={ry} fill="currentColor" />
      {dots.map((d) => (
        <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r="2.2" fill="var(--color-surface)" />
      ))}
    </g>
  );
}

/**
 * Crossed padel rackets, one flat colour (set it with a text colour class). A quiet accent for
 * empty and waiting states only: never in navigation, headers or the auth screens. Decorative.
 */
export function PadelRackets({ className }: { className?: string }) {
  return (
    <svg viewBox="20 50 160 138" className={cn('pointer-events-none', className)} aria-hidden="true">
      <g transform="translate(100 150) rotate(-36)">
        <Racket />
      </g>
      <g transform="translate(100 150) rotate(36)">
        <Racket />
      </g>
    </svg>
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
        <span className={cn('text-pink-700', stacked ? 'text-body tracking-[0.12em]' : 'text-caption tracking-wide')}>{VENUE_SHORT}</span>
      </span>
    </Link>
  );
}
