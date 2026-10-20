'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { shouldMarkNavigationStart } from '@/lib/app-navigation';

const STUCK_MS = 12_000;

function currentLocationKey() {
  return `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`;
}

/** Thin top bar that appears the instant an in-app link is clicked, before the next page is ready. */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname}?${searchParams.toString()}`;
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);

  if (pendingFrom !== null && pendingFrom !== locationKey) {
    setPendingFrom(null);
  }

  const pending = pendingFrom === locationKey;

  useEffect(() => {
    document.body.style.cursor = pending ? 'progress' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [pending]);

  useEffect(() => {
    let stuck: number | undefined;

    const start = () => {
      setPendingFrom(currentLocationKey());
      window.clearTimeout(stuck);
      stuck = window.setTimeout(() => setPendingFrom(null), STUCK_MS);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const a = target.closest('a');
      if (!a) return;
      if (
        shouldMarkNavigationStart({
          href: a.getAttribute('href'),
          currentHref: window.location.href,
          target: a.getAttribute('target'),
          download: a.hasAttribute('download'),
          modifiedClick: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0,
        })
      ) {
        start();
      }
    };

    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const method = (form.getAttribute('method') || 'get').toLowerCase();
      if (method !== 'get') return;
      const action = form.getAttribute('action');
      if (
        shouldMarkNavigationStart({
          href: action || window.location.pathname + window.location.search,
          currentHref: window.location.href,
          target: form.getAttribute('target'),
          download: false,
          modifiedClick: false,
        })
      ) {
        start();
      }
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
      window.clearTimeout(stuck);
    };
  }, []);

  if (!pending) return null;

  return (
    <div role="progressbar" aria-label="טוען עמוד" aria-busy="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 bg-pink-100">
      <div className="h-full w-2/3 origin-start animate-nav-progress bg-navy-900" />
    </div>
  );
}
