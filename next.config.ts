import type { NextConfig } from 'next';

/** Event cover images live in the public `event-images` bucket of the project's Supabase Storage. */
function supabaseImageConfig(): NonNullable<NextConfig['images']> {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return {
      remotePatterns: [
        {
          protocol: url.protocol === 'http:' ? 'http' : 'https',
          hostname: url.hostname,
          port: url.port,
          pathname: '/storage/v1/object/public/event-images/**',
        },
      ],
      // Optimized event covers stay in the Next image cache; Storage itself is cache-busted by a new object path.
      minimumCacheTTL: 60 * 60 * 24,
      // Only for a local Supabase (supabase start); never in production.
      dangerouslyAllowLocalIP: isLocal && process.env.NODE_ENV !== 'production',
    };
  } catch {
    return {};
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: supabaseImageConfig(),
  experimental: {
    // Event cover images are uploaded through a server action: 4 MB image + multipart overhead.
    serverActions: { bodySizeLimit: '5mb' },
    optimizePackageImports: ['lucide-react'],
    // Reuse the bottom-nav prefetch for 30s so tab switches are instant. Booking actions already
    // call revalidatePath, so a successful book/cancel still refreshes. The database remains the
    // source of truth if two people race the last spot.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Browsers ignore HSTS over plain http (local dev), so this only takes effect in production.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Approval status can change while this page is open; never serve a stored copy.
        source: '/pending',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, no-cache, must-revalidate' }],
      },
      {
        // The service worker must always be re-checked so a new version is picked up, and it may only
        // load its own origin's scripts.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
