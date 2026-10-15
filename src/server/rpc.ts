import 'server-only';
import type { Db } from '@/lib/supabase/server';
import { toAppError } from '@/lib/domain/errors';

/** Calls a SQL function (all business rules live there) and converts failures to AppError. */
export async function rpc<T>(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw toAppError(error);
  return data as T;
}

/** Unwraps a PostgREST query result or throws an AppError. */
export function unwrap<T>(result: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (result.error) throw toAppError(result.error);
  return result.data as T;
}

/**
 * A many-to-one embed from PostgREST. Generated types often say `T[]`; the payload is `T | null`.
 */
export function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
