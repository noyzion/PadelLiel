import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/card';

/**
 * A quiet strip above an admin preview: says it is only a preview, explains the event's state, and
 * holds the next actions. Sticks below the mobile header so the actions stay reachable.
 */
export function PreviewBar({ description, children }: { description: ReactNode; children?: ReactNode }) {
  return (
    <div className="sticky top-16 z-20 -mx-4 mb-6 border-y border-pink-200 bg-pink-50/95 px-4 py-3 backdrop-blur md:top-0 md:mx-0 md:rounded-control md:border">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Badge tone="rose">תצוגה מקדימה</Badge>
          <p className="text-small text-muted">{description}</p>
        </div>
        {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
    </div>
  );
}
