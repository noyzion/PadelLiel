'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Accessible modal built on the native <dialog>: focus is trapped, Esc closes,
 * and the page behind is inert while open. Bottom sheet on phones, centered card from `sm` up.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-surface p-0 text-ink shadow-lift',
        'max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0',
        'open:animate-sheet-in',
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="overflow-y-auto p-6 pb-4">
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-card font-bold">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="סגירה"
                className="-me-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-navy-50 hover:text-navy-900"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 text-small leading-relaxed">{children}</div>
          </div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
