'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker (Push only, no caching) so notifications reach the device even when the app is closed
 * and a tap opens the right page. Registering never asks for any permission.
 */
export function ServiceWorkerRegistrar({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Unsupported context (e.g. plain http): the in-app notification center still works.
    });
  }, [enabled]);
  return null;
}
