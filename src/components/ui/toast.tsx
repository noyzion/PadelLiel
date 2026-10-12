'use client';

import { CircleCheck, Info, OctagonAlert } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const toneClasses: Record<ToastTone, string> = {
  success: 'border-success-line bg-success-soft',
  error: 'border-danger-line bg-danger-soft',
  info: 'border-ocean-100 bg-ocean-50',
};

const toneIcons = {
  success: { Icon: CircleCheck, className: 'text-success' },
  error: { Icon: OctagonAlert, className: 'text-danger' },
  info: { Icon: Info, className: 'text-ocean-700' },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-2), { id, tone, message }]);
    window.setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 4500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((t) => {
          const { Icon, className } = toneIcons[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-md animate-fade-in items-start gap-3 rounded-2xl border px-4 py-3 text-small font-medium text-navy-900 shadow-lift',
                toneClasses[t.tone],
              )}
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', className)} aria-hidden="true" />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
