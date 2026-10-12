import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireSupabaseConfig } from '@/lib/env';

/**
 * Supabase client bound to the current request's cookies (runs as the logged-in user,
 * so Row Level Security applies). Create one per request; never share between requests.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = requireSupabaseConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies can't be written there.
          // The proxy refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}

export type Db = Awaited<ReturnType<typeof createClient>>;
