'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { getApprovalStatusAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';

const INTERVAL_MS = 8_000;

/**
 * The waiting screen lives on the trainee's phone while the coach approves on another device.
 * Next's client cache can keep showing this page after the row has already changed, so we re-read
 * the status and do a full navigation once she is approved (or sent elsewhere).
 */
export function PendingGate() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const status = await getApprovalStatusAction();
      if (cancelled) return;
      if (status === 'approved') {
        window.location.replace('/');
        return;
      }
      if (status === 'signed_out') {
        window.location.replace('/login');
        return;
      }
      // rejected / inactive: the server page already shows the right copy; just refresh it.
      if (status !== 'pending') router.refresh();
    }

    void check();
    const id = window.setInterval(() => void check(), INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [router]);

  return (
    <Button
      type="button"
      variant="secondary"
      loading={pending}
      onClick={() => startTransition(() => window.location.replace('/'))}
    >
      כבר אושרת? כנסי
    </Button>
  );
}
