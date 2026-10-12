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

const RACKET = { cy: -58, rx: 31, ry: 42 } as const;

/** Staggered grid of holes inside the racket head. */
function racketDots() {
  const { cy, rx, ry } = RACKET;
  const dots: { x: number; y: number }[] = [];
  for (let row = 0, y = cy - ry + 12; y <= cy + ry - 14; row += 1, y += 8) {
    for (let x = -rx + 10 + (row % 2) * 4; x <= rx - 9; x += 8) {
      if ((x / (rx - 8)) ** 2 + ((y - cy) / (ry - 9)) ** 2 <= 1) dots.push({ x, y });
    }
  }
  return dots;
}

/**
 * A single tilted racket with real see-through holes (even-odd cut-outs), so it works on any
 * background, e.g. the primary button. One flat colour via a text colour class. Decorative.
 */
export function PadelRacket({ className }: { className?: string }) {
  const { cy, rx, ry } = RACKET;
  const head = `M${-rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
  const holes = racketDots()
    .map((d) => `M${d.x - 2.2} ${d.y}a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0z`)
    .join('');
  return (
    <svg viewBox="-38 -104 76 142" className={cn('pointer-events-none', className)} aria-hidden="true">
      <path d={head + holes} fill="currentColor" fillRule="evenodd" />
      <rect x="-5" y="-17" width="10" height="38" rx="3" fill="currentColor" />
      <rect x="-6.5" y="8" width="13" height="30" rx="3.5" fill="currentColor" />
    </svg>
  );
}

/** One racket, drawn upright with its grip crossing point at (0,0). Head dots follow a staggered grid. */
function Racket() {
  const { cy, rx, ry } = RACKET;
  const dots = racketDots();
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
        <span className={cn('text-muted', stacked ? 'text-body tracking-[0.12em]' : 'text-caption tracking-wide')}>{VENUE_SHORT}</span>
      </span>
    </Link>
  );
}
