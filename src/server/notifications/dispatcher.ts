import 'server-only';
import { buildPushPayload, classifyPushFailure, pushTtlSeconds } from '@/lib/domain/notifications';

/**
 * Notification dispatcher: pulls due Push work out of the database, sends it with Web Push (VAPID) and reports
 * the outcome back. The database owns every rule (what is due, what is still valid, retries, back-off, the
 * attempt limit); this module only does the network part. Dependencies are injected so the logic is testable.
 */

export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface ClaimedJob {
  job_id: string;
  notification_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  url: string;
  subscriptions: PushTarget[];
}

export interface JobOutcome {
  delivered: string[];
  retry: string[];
  gone: string[];
  error?: string;
}

export interface DispatchDeps {
  claim(limit: number): Promise<ClaimedJob[]>;
  complete(jobId: string, outcome: JobOutcome): Promise<void>;
  /** Sends one payload to one subscription. Throws an error carrying `statusCode` when the push service refuses it. */
  send(target: PushTarget, payload: string, options: { ttl: number }): Promise<void>;
}

export interface DispatchSummary {
  claimed: number;
  delivered: number;
  retried: number;
  removed: number;
  rejected: number;
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const code = (err as { statusCode?: unknown }).statusCode;
    return typeof code === 'number' ? code : undefined;
  }
  return undefined;
}

/** Sends one claimed job to every device of the user and builds the outcome report. */
export async function deliverJob(job: ClaimedJob, send: DispatchDeps['send']): Promise<JobOutcome> {
  const payload = JSON.stringify(buildPushPayload(job));
  const ttl = pushTtlSeconds(job.type);
  const outcome: JobOutcome = { delivered: [], retry: [], gone: [] };
  const errors: string[] = [];

  await Promise.all(
    job.subscriptions.map(async (target) => {
      try {
        await send(target, payload, { ttl });
        outcome.delivered.push(target.id);
      } catch (err) {
        const status = statusOf(err);
        const kind = classifyPushFailure(status);
        if (kind === 'gone') outcome.gone.push(target.id);
        else if (kind === 'retry') outcome.retry.push(target.id);
        // 'permanent': neither delivered nor retried - it cannot succeed, so it is only reported.
        errors.push(`${kind}${status ? ` HTTP ${status}` : ''}`);
      }
    }),
  );

  if (errors.length > 0) outcome.error = [...new Set(errors)].join(', ');
  return outcome;
}

/**
 * Runs the dispatcher until nothing is left or the time budget is used up. Safe to run concurrently with
 * itself (the database hands every job to exactly one runner) and idempotent.
 */
export async function runDispatch(
  deps: DispatchDeps,
  options: { batchSize?: number; budgetMs?: number; now?: () => number } = {},
): Promise<DispatchSummary> {
  const batchSize = options.batchSize ?? 50;
  const budgetMs = options.budgetMs ?? 40_000;
  const now = options.now ?? Date.now;
  const started = now();
  const summary: DispatchSummary = { claimed: 0, delivered: 0, retried: 0, removed: 0, rejected: 0 };

  for (;;) {
    const jobs = await deps.claim(batchSize);
    summary.claimed += jobs.length;

    for (const job of jobs) {
      const outcome = await deliverJob(job, deps.send);
      await deps.complete(job.job_id, outcome);
      summary.delivered += outcome.delivered.length;
      summary.retried += outcome.retry.length;
      summary.removed += outcome.gone.length;
      summary.rejected += job.subscriptions.length - outcome.delivered.length - outcome.retry.length - outcome.gone.length;
    }

    if (jobs.length < batchSize || now() - started > budgetMs) break;
  }
  return summary;
}
