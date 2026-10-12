import 'server-only';
import { cache } from 'react';
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

/** Reads the editable business settings (display only — the database enforces them). */
export async function getSettings(db: Db): Promise<AppSettings> {
  const rows = unwrap(await db.from('app_settings').select('key, value')) as { key: string; value: unknown }[];
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

export async function updateSettings(db: Db, settings: AppSettings) {
  const entries: [string, unknown][] = [
    ['cancellation_cutoff_hours', settings.cancellation_cutoff_hours],
    ['default_capacity', settings.default_capacity],
    ['default_time_slots', settings.default_time_slots],
  ];
  for (const [key, value] of entries) {
    unwrap(await db.from('app_settings').update({ value }).eq('key', key).select('key'));
  }
}

export const getSkillLevels = cache(async (db: Db): Promise<SkillLevel[]> => {
  return unwrap(
    await db.from('skill_levels').select('*').eq('is_active', true).order('sort_order'),
  ) as SkillLevel[];
});
