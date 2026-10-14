import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The shared configuration cache (`getSettings` / `getSkillLevels`): it must save database reads, hand out
 * fresh values after an admin edit, never freeze an empty/denied read, and never hold anything user-specific.
 * Next's cache is replaced by a minimal in-memory model of `unstable_cache` + `updateTag` (tags and key parts only).
 */

type Entry = { value: unknown; tags: string[]; revalidate: number };
const cacheStore = new Map<string, Entry>();
const updatedTags: string[] = [];

vi.mock('server-only', () => ({}));
vi.mock('react', () => ({
  // React's per-request memoisation, modelled as "same first argument => same promise".
  cache: <A, R>(fn: (arg: A) => R) => {
    const memo = new Map<A, R>();
    return (arg: A) => {
      if (!memo.has(arg)) memo.set(arg, fn(arg));
      return memo.get(arg)!;
    };
  },
}));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[], options: { tags: string[]; revalidate: number }) => {
    const key = keyParts.join('|');
    return async () => {
      const hit = cacheStore.get(key);
      if (hit) return structuredClone(hit.value);
      const value = await fn(); // a thrown error is not cached, exactly like Next
      cacheStore.set(key, { value: structuredClone(value), tags: options.tags, revalidate: options.revalidate });
      return value;
    };
  },
  updateTag: (tag: string) => {
    updatedTags.push(tag);
    for (const [key, entry] of cacheStore) if (entry.tags.includes(tag)) cacheStore.delete(key);
  },
}));

const { getSettings, getSkillLevels, updateSettings, APP_CONFIG_CACHE_TAG, CONFIG_CACHE_SECONDS } = await import(
  '@/server/services/settings'
);

type Row = Record<string, unknown>;

/** A fake request-bound client. Counts reads per table and lets a test script the data / failures. */
function fakeDb(initial: { app_settings?: Row[]; skill_levels?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    app_settings: initial.app_settings ?? [
      { key: 'cancellation_cutoff_hours', value: 8 },
      { key: 'default_capacity', value: 4 },
      { key: 'default_time_slots', value: [{ start: '07:00', end: '08:00' }] },
    ],
    skill_levels: initial.skill_levels ?? [
      { code: 'beginner', label_he: '×ž×ª×—×™×œ×•×ª', sort_order: 1, is_active: true },
      { code: 'advanced', label_he: '×ž×ª×§×“×ž×•×ª', sort_order: 2, is_active: true },
    ],
  };
  const reads: Record<string, number> = {};
  const failWritesFor = new Set<string>();

  const db = {
    from(table: string) {
      let mode: 'read' | 'update' = 'read';
      let patch: Row = {};
      let matchKey: unknown;
      const builder = {
        select() {
          if (mode === 'read') reads[table] = (reads[table] ?? 0) + 1;
          return builder;
        },
        eq(column: string, value: unknown) {
          if (column === 'key') matchKey = value;
          return builder;
        },
        order: () => builder,
        update(values: Row) {
          mode = 'update';
          patch = values;
          return builder;
        },
        then(resolve: (r: { data: Row[] | null; error: { message: string } | null }) => void) {
          if (mode === 'update') {
            if (failWritesFor.has(String(matchKey))) return resolve({ data: null, error: { message: 'write failed' } });
            for (const row of tables[table]) if (row.key === matchKey) Object.assign(row, patch);
            return resolve({ data: [{ key: matchKey }] as Row[], error: null });
          }
          return resolve({ data: structuredClone(tables[table]), error: null });
        },
      };
      return builder;
    },
  };
  return { db: db as never, tables, reads, failWritesFor };
}

const NEW_SETTINGS = {
  cancellation_cutoff_hours: 12,
  default_capacity: 6,
  default_time_slots: [{ start: '09:00', end: '10:00' }],
};

beforeEach(() => {
  cacheStore.clear();
  updatedTags.length = 0;
});

describe('getSettings / getSkillLevels', () => {
  it('reads each table once and serves repeats from the cache', async () => {
    const { db, reads } = fakeDb();
    const first = await getSettings(db);
    const second = await getSettings(db);
    const levels = await getSkillLevels(db);
    expect(first.cancellation_cutoff_hours).toBe(8);
    expect(second).toEqual(first);
    expect(levels.map((l) => l.code)).toEqual(['beginner', 'advanced']);
    expect(reads).toEqual({ app_settings: 1, skill_levels: 1 });
  });

  it('is shared between requests: a different client does not read again', async () => {
    const a = fakeDb();
    const b = fakeDb();
    await getSettings(a.db);
    await getSkillLevels(b.db);
    expect(a.reads).toEqual({ app_settings: 1, skill_levels: 1 });
    expect(b.reads).toEqual({});
  });

  it('does not freeze an empty settings read: defaults go to that caller only', async () => {
    const denied = fakeDb({ app_settings: [] });
    expect((await getSettings(denied.db)).cancellation_cutoff_hours).toBe(8); // built-in default
    expect(cacheStore.size).toBe(0);

    const allowed = fakeDb();
    allowed.tables.app_settings[0].value = 24;
    expect((await getSettings(allowed.db)).cancellation_cutoff_hours).toBe(24);
  });

  it('does not freeze an empty skill-level read either', async () => {
    const empty = fakeDb({ skill_levels: [] });
    expect(await getSkillLevels(empty.db)).toEqual([]);
    expect(cacheStore.size).toBe(0);

    const filled = fakeDb();
    expect((await getSkillLevels(filled.db)).length).toBe(2);
    expect(cacheStore.size).toBe(1);
  });

  it('keeps the same fallbacks as before for invalid stored values', async () => {
    const { db } = fakeDb({ app_settings: [{ key: 'cancellation_cutoff_hours', value: 'abc' }, { key: 'default_capacity', value: 0 }] });
    expect(await getSettings(db)).toEqual({
      cancellation_cutoff_hours: 8,
      default_capacity: 4,
      default_time_slots: [
        { start: '07:00', end: '08:00' },
        { start: '08:00', end: '09:00' },
      ],
    });
  });

  it('uses a bounded lifetime and one tag, and holds only global columns', async () => {
    expect(CONFIG_CACHE_SECONDS).toBeGreaterThan(0);
    expect(CONFIG_CACHE_SECONDS).toBeLessThanOrEqual(600);
    const { db } = fakeDb();
    await getSettings(db);
    const [entry] = [...cacheStore.values()];
    expect(entry.tags).toEqual([APP_CONFIG_CACHE_TAG]);
    expect(entry.revalidate).toBe(CONFIG_CACHE_SECONDS);
    const value = entry.value as { settings: Row[]; levels: Row[] };
    expect(Object.keys(value).sort()).toEqual(['levels', 'settings']);
    for (const row of value.settings) expect(Object.keys(row).sort()).toEqual(['key', 'value']);
    for (const row of value.levels) expect(Object.keys(row).sort()).toEqual(['code', 'is_active', 'label_he', 'sort_order']);
  });
});

describe('updateSettings invalidation', () => {
  /** A later request: a new client object (so no per-request memo) over the same underlying database. */
  function nextRequest(shared: ReturnType<typeof fakeDb>) {
    const real = shared.db as { from: (table: string) => unknown };
    return { from: (table: string) => real.from(table) } as never;
  }

  it('expires the shared entry and the next request reads the edited values', async () => {
    const shared = fakeDb();
    expect((await getSettings(shared.db)).cancellation_cutoff_hours).toBe(8);

    await updateSettings(shared.db, NEW_SETTINGS);
    expect(updatedTags).toEqual([APP_CONFIG_CACHE_TAG]);
    expect(cacheStore.size).toBe(0);

    expect(await getSettings(nextRequest(shared))).toEqual(NEW_SETTINGS);
    expect(shared.reads.app_settings).toBe(2); // one fill before the edit, one refill after it
  });

  it('invalidates even when a write fails halfway, and still reports the failure', async () => {
    const shared = fakeDb();
    await getSettings(shared.db);
    shared.failWritesFor.add('default_capacity');

    await expect(updateSettings(shared.db, NEW_SETTINGS)).rejects.toThrow();
    expect(updatedTags).toEqual([APP_CONFIG_CACHE_TAG]);
    // The first write did land, and the next request sees it instead of a stale entry.
    expect((await getSettings(nextRequest(shared))).cancellation_cutoff_hours).toBe(12);
  });

  it('keeps serving the cache until an edit happens', async () => {
    const shared = fakeDb();
    await getSettings(shared.db);
    shared.tables.app_settings[0].value = 99; // changed behind the app's back
    expect((await getSettings(nextRequest(shared))).cancellation_cutoff_hours).toBe(8); // bounded by the TTL, see above
  });
});
