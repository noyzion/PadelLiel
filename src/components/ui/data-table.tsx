import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Compact table used by admin lists and usage histories. Scrolls inside its own card on narrow screens. */
export function DataTable({ children, className, caption }: { children: ReactNode; className?: string; caption?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-card border border-line bg-surface shadow-soft', className)}>
      <table className="w-full text-small">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-navy-50 text-caption text-navy-900">{children}</thead>;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} className={cn('border-t border-line first:border-t-0', className)} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" {...props} className={cn('px-4 py-3 text-start font-semibold', className)} />;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cn('num px-4 py-3 align-middle', className)} />;
}
