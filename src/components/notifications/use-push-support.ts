'use client';

import { useSyncExternalStore } from 'react';
import { detectPushSupport, type PushSupportState } from '@/lib/push-support';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function read(hasVapidKey: boolean): PushSupportState {
  return detectPushSupport({
    hasVapidKey,
    isSecureContext: window.isSecureContext,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : null,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(),
  });
}

/** Re-renders when the user changes the notification permission in the browser settings. */
function subscribe(onChange: () => void): () => void {
  let status: PermissionStatus | null = null;
  let active = true;
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((s) => {
      if (!active) return;
      status = s;
      s.addEventListener('change', onChange);
    })
    .catch(() => {});
  return () => {
    active = false;
    status?.removeEventListener('change', onChange);
  };
}

/** What this device can do about Push right now. 'checking' during server rendering / hydration. */
export function usePushSupport(hasVapidKey: boolean): PushSupportState | 'checking' {
  return useSyncExternalStore(
    subscribe,
    () => read(hasVapidKey),
    () => 'checking',
  );
}
