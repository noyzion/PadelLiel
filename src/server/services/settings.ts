import 'server-only';
import { cache } from 'react';
import { unstable_cache, updateTag } from 'next/cache';
import type { Db } from '@/lib/supabase/server';
import type { AppSettings, SkillLevel } from '@/lib/domain/types';
import { unwrap } from '../rpc';

const DEFAULTS: AppSettings = {
  cancellation_cutoff_hours: 8,
  default_capacity: 4,
  default_time_slots: [
    { start: '07:00', end: '08:00' },
    { start: '08:00', end: '09:00' },
  ],
};

/* ------------------------------ shared cache ------------------------------ */

/**
 * `app_settings` and `skill_levels` are global configuration: identical for every signed-in user, rarely edited,
 * and read on almost every page, so they are kept in Next's shared data cache (one entry holding both) instead of
 * being re-read from the database on every request.
 *
 * Safety rules for this cache (do not relax them):
 *  - Only global, non-sensitive rows go in: no user id, no filter, no per-user column. Anything user-specific
 *    (profile, bookings, allowance, schedule) must stay uncached.
 *  - The cache is only read through functions that take a request-bound `Db`, and every caller is already behind
 *    `requireMember()` / `requireAdmin()`. After a miss, the refill runs as that signed-in user, so RLS still
 *    decides what may be read. No service-role key or privileged client is involved.
 *  - An empty result is never cached (it means "nothing readable", not "nothing configured"), so a denied or
 *    failed read can never freeze the defaults for everybody.
 *  - Admin edits invalidate the entry immediately (`updateTag`). The time limit is only the safety net for edits
 *    made outside the app (e.g. directly in the Supabase dashboard, which is how skill levels are changed).
 *  - The business rules themselves are enforced by the database (cutoff, quota, capacity); these values are only
 *    displayed by the UI, so a stale value can never change what is allowed.
 */
export const APP_CONFIG_CACHE_TAG = 'app-config';
/** Safety net for out-of-band edits. In-app edits do not wait for it. Bump the version suffix if a row shape changes. */
export const CONFIG_CACHE_SECONDS = 300;
const CACHE_KEY = ['app-config', 'v1'];

type SettingRow = { key: string; value: unknown };
interface AppConfig {
  settings: SettingRow[];
  levels: SkillLevel[];
}

/** Thrown inside the cached loader to refuse caching; `readConfig` swallows it and returns the fresh value. */
class NotCacheable extends Error {}

async function loadConfig(db: Db): Promise<AppConfig> {
  const [settings, levels] = await Promise.all([
    db.from('app_settings').select('key, value'),
    db.from('skill_levels').select('*').eq('is_active', true).order('sort_order'),
  ]);
  return { settings: unwrap(settings) as SettingRow[], levels: unwrap(levels) as SkillLevel[] };
}

/** Both configuration tables, via the shared cache, deduplicated per request. */
const readConfig = cache(async (db: Db): Promise<AppConfig> => {
  let fresh: AppConfig | undefined;
  try {
    return await unstable_cache(
      async () => {
        const value = await loadConfig(db);
        if (value.settings.length === 0 || value.levels.length === 0) {
          fresh = value; // returned to this caller only, never shared
          throw new NotCacheable();
        }
        return value;
      },
      CACHE_KEY,
      { tags: [APP_CONFIG_CACHE_TAG], revalidate: CONFIG_CACHE_SECONDS },
    )();
  } catch (err) {
    if (err instanceof NotCacheable && fresh) return fresh;
    throw err;
  }
});

/* -------------------------------- settings -------------------------------- */

function parseSettings(rows: SettingRow[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const cutoff = Number(map.get('cancellation_cutoff_hours'));
  const capacity = Number(map.get('default_capacity'));
  const slots = map.get('default_time_slots');
  return {
    cancellation_cutoff_hours: Number.isFinite(cutoff) ? cutoff : DEFAULTS.cancellation_cutoff_hours,
    default_capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : DEFAULTS.default_capacity,
    default_time_slots:
      Array.isArray(slots) && slots.length > 0 ? (slots as AppSettings['default_time_slots']) : DEFAULTS.default_time_slots,
  };
}

/**
 * Reads the editable business settings (display only - the database enforces them).
 * Served from the shared cache; `updateSettings` invalidates it.
 */
export async function getSettings(db: Db): Promise<AppSettings> {
  return parseSettings((await readConfig(db)).settings);
}

/** Admin only (RLS + the caller's `actionContext('admin')`). Always invalidates the cache, even if a write fails midway. */
export async function updateSettings(db: Db, settings: AppSettings) {
  const entries: [string, unknown][] = [
    ['cancellation_cutoff_hours', settings.cancellation_cutoff_hours],
    ['default_capacity', settings.default_capacity],
    ['default_time_slots', settings.default_time_slots],
  ];
  try {
    for (const [key, value] of entries) {
      unwrap(await db.from('app_settings').update({ value }).eq('key', key).select('key'));
    }
  } finally {
    // `updateTag` (read-your-own-writes) expires the entry at once: the admin's next render, and every other
    // user's, reads the new values. It may only be called from a Server Action, which is the only caller.
    updateTag(APP_CONFIG_CACHE_TAG);
  }
}

/* ------------------------------- skill levels ------------------------------- */

/** Active skill levels, in display order. Same shared entry as the settings (no in-app screen edits levels). */
export async function getSkillLevels(db: Db): Promise<SkillLevel[]> {
  return (await readConfig(db)).levels;
}
