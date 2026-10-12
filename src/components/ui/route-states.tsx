'use client';

import Link from 'next/link';
import { BrandMark } from '@/components/brand';
import { Button, buttonClasses } from '@/components/ui/button';
import { PageSkeleton } from '@/components/ui/skeleton';

export function RouteLoading() {
  return <PageSkeleton />;
}

export function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex min-h-[50vh] max-w-sm flex-col items-center justify-center gap-3 text-center">
      <BrandMark className="size-12" />
      <p className="text-card font-bold">משהו השתבש</p>
      <p className="text-small text-muted">לא הצלחנו לטעון את העמוד. אפשר לנסות שוב, ואם זה חוזר, כדאי לרענן את הדף.</p>
      <Button onClick={reset}>ניסיון חוזר</Button>
    </div>
  );
}

export function RouteNotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-sm flex-col items-center justify-center gap-3 text-center">
      <BrandMark className="size-12" />
      <p className="text-card font-bold">העמוד לא נמצא</p>
      <p className="text-small text-muted">ייתכן שהקישור שגוי או שהפריט כבר לא קיים.</p>
      <Link href="/" className={buttonClasses('primary', 'md')}>
        לדף הבית
      </Link>
    </div>
  );
}
