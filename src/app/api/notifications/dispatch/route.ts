import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import webpush from 'web-push';
import { getDispatcherSecret, getPushServerConfig, getSupabaseConfig } from '@/lib/env';
import { runDispatch, type ClaimedJob, type DispatchDeps, type PushTarget } from '@/server/notifications/dispatcher';

/**
 * The notification dispatcher endpoint. Called every minute by Supabase pg_cron (see docs/NOTIFICATIONS.md);
 * also works from Vercel Cron (Pro) or any external scheduler. Requires `Authorization: Bearer <secret>`.
 *
 * It uses the publishable (anon) key and no service_role key: the database functions it calls are guarded by the
 * same secret (only its SHA-256 is stored in the database).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function isAuthorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  return timingSafeEqual(sha256(match[1]), sha256(secret));
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = getDispatcherSecret();
  const supabase = getSupabaseConfig();
  if (!secret || !supabase) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const db = createClient(supabase.url, supabase.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const push = getPushServerConfig();

  const deps: DispatchDeps = {
    async claim(limit) {
      const { data, error } = await db.rpc('worker_claim_jobs', { p_secret: secret, p_limit: limit });
      if (error) throw new Error(`claim failed: ${error.message}`);
      return (data ?? []) as ClaimedJob[];
    },
    async complete(jobId, outcome) {
      const { error } = await db.rpc('worker_complete_job', {
        p_secret: secret,
        p_job_id: jobId,
        p_delivered: outcome.delivered,
        p_retry: outcome.retry,
        p_gone: outcome.gone,
        p_error: outcome.error ?? null,
      });
      if (error) throw new Error(`complete failed: ${error.message}`);
    },
    async send(target: PushTarget, payload, { ttl }) {
      if (!push) {
        // Push is not configured yet: reminders still reach the in-app notification center.
        throw Object.assign(new Error('push not configured'), { statusCode: 400 });
      }
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
        TTL: ttl,
        urgency: 'normal',
        timeout: 10_000,
        vapidDetails: { subject: push.subject, publicKey: push.publicKey, privateKey: push.privateKey },
      });
    },
  };

  try {
    const summary = await runDispatch(deps);
    return NextResponse.json({ ok: true, pushConfigured: Boolean(push), ...summary });
  } catch (err) {
    console.error('[notifications] dispatch failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'dispatch_failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
