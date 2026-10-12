'use client';

import { RouteError } from '@/components/ui/route-states';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} />;
}
