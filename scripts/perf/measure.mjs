/**
 * Performance / behaviour harness for the server-rendered pages. No dependencies, no real Supabase.
 *
 * It starts a tiny in-process fake of the Supabase HTTP API (Auth JWKS + PostgREST), mints real ES256-signed
 * session cookies for a trainee and an admin, then drives a running production build of the app and reports,
 * per page, how many Supabase HTTP requests one render costs and how long it takes.
 *
 * The fake can add an artificial per-request delay (MOCK_LATENCY_MS) to model the distance between the
 * app's server region and the database region: every extra Supabase request costs one full round trip.
 *
 * Usage (PowerShell):
 *   $env:NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54399'
 *   $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_perf'
 *   npx next build
 *   $env:PORT = 3100; npx next start          # in a second terminal, same env vars
 *   node scripts/perf/measure.mjs             # optional: MOCK_LATENCY_MS=40 APP_URL=http://localhost:3100 RUNS=15
 *
 * NEXT_PUBLIC_* values are inlined at build time, so the build must see the fake URL.
 * Nothing here talks to a real Supabase project and nothing is written outside memory.
 */
import { createServer } from 'node:http';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3100';
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 54399);
const LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 0);
const RUNS = Number(process.env.RUNS ?? 15);
const COOKIE_NAME = 'sb-localhost-auth-token';

/* ------------------------------- JWT / cookies ------------------------------- */

// The app caches the JWKS for several minutes, so the throwaway test key must survive between harness runs.
const KEY_FILE = join(tmpdir(), 'padel-perf-harness-key.json');
function loadKeyPair() {
  if (existsSync(KEY_FILE)) {
    const saved = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
    return { privateKey: createPrivateKey({ key: saved, format: 'jwk' }), publicKey: createPublicKey({ key: saved, format: 'jwk' }) };
  }
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  writeFileSync(KEY_FILE, JSON.stringify(pair.privateKey.export({ format: 'jwk' })));
  return pair;
}
const { privateKey, publicKey } = loadKeyPair();
const KID = 'perf-harness-key';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'ES256', use: 'sig', key_ops: ['verify'] };

const b64u = (input) => Buffer.from(input).toString('base64url');

function mintJwt(sub, email) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', typ: 'JWT', kid: KID };
  const payload = {
    iss: `http://localhost:${MOCK_PORT}/auth/v1`,
    sub,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    iat: now,
    exp: now + 3600,
    session_id: randomUUID(),
  };
  const data = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return { token: `${data}.${signature.toString('base64url')}`, exp: payload.exp };
}

function sessionCookie(sub, email) {
  const { token, exp } = mintJwt(sub, email);
  const session = {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'perf-refresh',
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
  return `${COOKIE_NAME}=base64-${b64u(JSON.stringify(session))}`;
}

/* ------------------------------- fake database ------------------------------- */

const TRAINEE = { id: randomUUID(), email: 'trainee@example.test' };
const ADMIN = { id: randomUUID(), email: 'admin@example.test' };

const profiles = new Map([
  [TRAINEE.id, { id: TRAINEE.id, role: 'trainee', full_name: 'Test Trainee', phone: null, email: TRAINEE.email, approval_status: 'approved', skill_level_code: 'beginner', created_at: '2026-01-01T00:00:00Z' }],
  [ADMIN.id, { id: ADMIN.id, role: 'admin', full_name: 'Test Admin', phone: null, email: ADMIN.email, approval_status: 'approved', skill_level_code: null, created_at: '2026-01-01T00:00:00Z' }],
]);

const settings = new Map([
  ['cancellation_cutoff_hours', 8],
  ['default_capacity', 4],
  ['default_time_slots', [{ start: '07:00', end: '08:00' }, { start: '08:00', end: '09:00' }]],
]);

const skillLevels = [
  { code: 'beginner', label_he: 'מתחילות', sort_order: 1, is_active: true },
  { code: 'intermediate', label_he: 'בינוניות', sort_order: 2, is_active: true },
];

function monthStart() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

const allowance = () => ({
  month_start: monthStart(), plan_id: 'plan-1', plan_name: 'מנוי רגיל', plan_limit: 8, adjustments: 0,
  effective_limit: 8, used: 2, remaining: 6, has_active_subscription: true,
});

/** One confirmed booking two days from now (so the bookings page shows the cancellation policy text). */
function upcomingBooking() {
  const start = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  const end = new Date(start.getTime() + 3600 * 1000);
  const date = start.toISOString().slice(0, 10);
  return {
    booking_id: 'b-1', session_id: 's-1', status: 'CONFIRMED', booked_at: new Date().toISOString(), cancelled_at: null,
    session_date: date, start_time: '07:00:00', end_time: '08:00:00', starts_at: start.toISOString(), ends_at: end.toISOString(),
    week_start: date, session_status: 'PUBLISHED', skill_level_code: 'beginner',
    cancellation_deadline: new Date(start.getTime() - 8 * 3600 * 1000).toISOString(), is_late_window: false, can_cancel: true, counts_toward_allowance: true,
  };
}

/** Request counters, keyed "METHOD path" (e.g. "POST rpc/get_week_schedule"). */
const counters = new Map();
const bump = (key) => counters.set(key, (counters.get(key) ?? 0) + 1);
const snapshot = () => Object.fromEntries([...counters.entries()].sort());

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function callerId(req) {
  const auth = req.headers.authorization ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub;
  } catch {
    return null;
  }
}

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const mock = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
  const path = url.pathname;

  if (path === '/__stats') return json(res, 200, snapshot());
  if (path === '/__reset') {
    counters.clear();
    return json(res, 200, {});
  }

  bump(`${req.method} ${path.replace(/^\/(rest|auth)\/v1\//, '')}`);
  if (LATENCY_MS > 0) await new Promise((r) => setTimeout(r, LATENCY_MS));

  if (path === '/auth/v1/.well-known/jwks.json') return json(res, 200, { keys: [jwk] });

  const uid = callerId(req);
  const wantsObject = String(req.headers.accept ?? '').includes('vnd.pgrst.object');
  const rows = (list) => (wantsObject ? json(res, 200, list[0] ?? null) : json(res, 200, list));

  if (path === '/rest/v1/profiles') {
    const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
    return rows(profiles.has(id) ? [profiles.get(id)] : []);
  }
  if (path === '/rest/v1/app_settings') {
    if (!uid) return rows([]);
    if (req.method === 'PATCH') {
      const key = (url.searchParams.get('key') ?? '').replace(/^eq\./, '');
      const { value } = JSON.parse((await readBody(req)) || '{}');
      if (profiles.get(uid)?.role !== 'admin') return json(res, 403, { code: '42501', message: 'denied' });
      settings.set(key, value);
      return rows([{ key }]);
    }
    return rows([...settings.entries()].map(([key, value]) => ({ key, value })));
  }
  if (path === '/rest/v1/skill_levels') return rows(skillLevels);
  if (path === '/rest/v1/community_events') return rows([]);
  if (path === '/rest/v1/member_subscriptions') return rows([]);
  if (path === '/rest/v1/notifications') return rows([]);

  if (path.startsWith('/rest/v1/rpc/')) {
    const fn = path.slice('/rest/v1/rpc/'.length);
    if (fn === 'get_member_allowance') return json(res, 200, [allowance()]);
    if (fn === 'get_my_bookings') return json(res, 200, [upcomingBooking()]);
    if (fn === 'get_week_schedule') return json(res, 200, []);
    if (fn === 'week_has_sessions') return json(res, 200, false);
    if (fn === 'get_member_monthly_usage') return json(res, 200, []);
    return json(res, 200, []);
  }

  return json(res, 404, { message: `perf harness: unmocked ${req.method} ${path}` });
});

/* ------------------------------- measuring ------------------------------- */

const fmt = (n) => `${n.toFixed(0)}ms`;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function stats() {
  return (await fetch(`http://localhost:${MOCK_PORT}/__stats`)).json();
}
const reset = () => fetch(`http://localhost:${MOCK_PORT}/__reset`);

async function get(path, cookie) {
  const started = performance.now();
  const res = await fetch(`${APP_URL}${path}`, { headers: { cookie }, redirect: 'manual' });
  const html = await res.text();
  return { status: res.status, ms: performance.now() - started, html, location: res.headers.get('location') };
}

async function measurePage(label, path, cookie) {
  await get(path, cookie); // warm-up: JIT, route compilation, JWKS fetch, cache fill
  await reset();
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await get(path, cookie);
    if (r.status !== 200) throw new Error(`${label}: expected 200, got ${r.status} (${r.location ?? ''})`);
    times.push(r.ms);
  }
  const perRender = Object.fromEntries(Object.entries(await stats()).map(([k, v]) => [k, +(v / RUNS).toFixed(2)]));
  const total = Object.values(perRender).reduce((a, b) => a + b, 0);
  console.log(`\n${label}  (${path})`);
  console.log(`  render time: median ${fmt(median(times))}, min ${fmt(Math.min(...times))}, max ${fmt(Math.max(...times))}  [${RUNS} runs]`);
  console.log(`  Supabase requests per render: ${total.toFixed(2)}`);
  for (const [k, v] of Object.entries(perRender)) console.log(`    ${String(v).padStart(5)}  ${k}`);
  return { label, path, medianMs: median(times), requestsPerRender: total, perRender };
}

/** Next.js server-action ids are only known after a build: read them from the manifest. */
function findActionId(exportedName) {
  const manifest = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8'));
  for (const [id, entry] of Object.entries(manifest.node ?? {})) {
    if (entry.exportedName === exportedName) return id;
  }
  return null;
}

async function settingsInvalidationCheck(adminCookie) {
  console.log('\nSettings cache invalidation (admin saves new cancellation cut-off)');
  const marker = (html, hours) => html.includes(`value="${hours}"`);
  const before = await get('/admin/settings', adminCookie);
  console.log(`  GET /admin/settings -> ${before.status}, shows 8h: ${marker(before.html, 8)}`);

  // The trainee's "my bookings" page prints the cancellation cut-off ("ביטול של לפחות N שעות ...").
  const traineeCookie = sessionCookie(TRAINEE.id, TRAINEE.email);
  const shown = async () => ((await get('/bookings', traineeCookie)).html.match(/ביטול של לפחות (?:<!-- -->)?\s*([\d.]+)/) ?? [])[1];
  console.log(`  trainee /bookings shows cut-off before the edit: ${await shown()}h`);

  const actionId = findActionId('saveSettingsAction');
  if (!actionId) return console.log('  SKIPPED: saveSettingsAction not found in .next/server/server-reference-manifest.json');

  const res = await fetch(`${APP_URL}/admin/settings`, {
    method: 'POST',
    headers: { cookie: adminCookie, 'next-action': actionId, 'content-type': 'text/plain;charset=UTF-8', accept: 'text/x-component' },
    body: JSON.stringify([{ cancellationCutoffHours: 12, defaultCapacity: 4, defaultTimeSlots: [{ start: '07:00', end: '08:00' }] }]),
  });
  const body = await res.text();
  console.log(`  POST saveSettingsAction -> ${res.status}, ok: ${body.includes('"ok":true')}`);

  const after = await get('/admin/settings', adminCookie);
  console.log(`  admin page now shows 12h: ${marker(after.html, 12)} (stale 8h: ${marker(after.html, 8)})`);
  console.log(`  trainee /bookings now shows cut-off: ${await shown()}h (expected 12)`);
}

mock.listen(MOCK_PORT, async () => {
  console.log(`fake Supabase on :${MOCK_PORT}, simulated latency ${LATENCY_MS}ms per request, app ${APP_URL}`);
  try {
    const trainee = sessionCookie(TRAINEE.id, TRAINEE.email);
    const results = [];
    for (const [label, path] of [
      ['Member home', '/'],
      ['Member schedule', '/schedule'],
      ['My bookings', '/bookings'],
      ['Profile', '/profile'],
    ]) {
      results.push(await measurePage(label, path, trainee));
    }
    if (process.env.CHECK_INVALIDATION === '1') await settingsInvalidationCheck(sessionCookie(ADMIN.id, ADMIN.email));
    if (process.env.JSON_OUT) console.log(`\nJSON ${JSON.stringify(results)}`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    mock.close();
  }
});
