'use client';

import { useCallback, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code: string };

/**
 * Runs a server action inside a transition and reports the outcome with a toast.
 * `run(() => action(...), { success: 'נשמר', onSuccess })`
 */
export function useServerAction() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const run = useCallback(
    <T,>(
      fn: () => Promise<Result<T>>,
      options: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void; onError?: (error: string, code: string) => void } = {},
    ) => {
      startTransition(async () => {
        const result = await fn();
        if (result.ok) {
          if (options.success) toast.success(typeof options.success === 'function' ? options.success(result.data) : options.success);
          options.onSuccess?.(result.data);
        } else {
          if (options.onError) options.onError(result.error, result.code);
          else toast.error(result.error);
        }
      });
    },
    [toast],
  );

  return { pending, run };
}
