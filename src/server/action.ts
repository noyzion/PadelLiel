import 'server-only';
import type { ZodType } from 'zod';
import { AppError, errorMessageHe, type ErrorCode } from '@/lib/domain/errors';
import { firstIssueMessage } from '@/lib/validation/schemas';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; error: string };

/** Validates untrusted input; throws an AppError(INVALID_INPUT) carrying the first Hebrew message. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('INVALID_INPUT', { userMessage: firstIssueMessage(result.error) });
  }
  return result.data;
}

/**
 * Runs a server action body and converts any failure into a typed result for the UI.
 * Do not call redirect() inside `fn` (it works by throwing) — redirect after checking the result.
 */
export async function runAction<T = void>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === 'INTERNAL') console.error('[action] internal error', err.cause);
      return { ok: false, code: err.code, error: err.userMessage ?? errorMessageHe(err.code) };
    }
    console.error('[action] unexpected error', err);
    return { ok: false, code: 'INTERNAL', error: errorMessageHe('INTERNAL') };
  }
}
