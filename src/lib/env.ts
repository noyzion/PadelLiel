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

/**
 * The coach's WhatsApp number (an Israeli mobile, any common format). Public by design: it is where a trainee who
 * forgot her password is sent. Optional; without it the "forgot password" page just says to contact the coach.
 */
export function getCoachWhatsAppNumber(): string | null {
  return process.env.NEXT_PUBLIC_COACH_WHATSAPP?.trim() || null;
}

/* ------------------------------------------------------------------ */
/* Web Push + notification dispatcher                                   */
/* ------------------------------------------------------------------ */

/** VAPID public key: public by design (the browser needs it to subscribe). Null = Push not configured. */
export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

export interface PushServerConfig {
  publicKey: string;
  privateKey: string;
  /** `mailto:` or https URL identifying the sender to push services. */
  subject: string;
}

/** Server-only. The VAPID private key must never be a NEXT_PUBLIC_ variable. */
export function getPushServerConfig(): PushServerConfig | null {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com' };
}

/**
 * Shared secret that authorises the notification dispatcher (the HTTP route AND the database functions it calls;
 * the database stores only its SHA-256). At least 32 characters. Never a NEXT_PUBLIC_ variable.
 */
export function getDispatcherSecret(): string | null {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}
