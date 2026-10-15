/**
 * Environment access. NEXT_PUBLIC_* variables must be referenced statically so Next.js can inline them.
 * No privileged (service_role) key is used anywhere in this app.
 */

export interface SupabaseConfig {
  url: string;
  key: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function requireSupabaseConfig(): SupabaseConfig {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).',
    );
  }
  return config;
}

/**
 * Safety switch for the annual-events import: writing is refused unless the server operator sets
 * `ALLOW_EVENT_IMPORT=1`. The dry-run (read-only) needs no switch. Never a NEXT_PUBLIC_ variable.
 */
export function isEventImportEnabled(): boolean {
  return process.env.ALLOW_EVENT_IMPORT?.trim() === '1';
}

/**
 * Public base URL of the app (used for e-mail redirects and the WhatsApp message).
 * `NEXT_PUBLIC_APP_URL` wins. When it is missing on Vercel, the deployment's own domain is used, so confirmation and
 * password-reset e-mails never point at localhost in production. Plain localhost is only the local-development default.
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return 'http://localhost:3000';
}
