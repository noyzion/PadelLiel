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
