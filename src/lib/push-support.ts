/**
 * What this browser can do about Web Push, decided from capability facts (pure, so it is unit-tested).
 *
 *   unconfigured       the server has no VAPID key yet
 *   unsupported        no service worker / Push API / Notification API (or not a secure context)
 *   ios-needs-install  iPhone / iPad outside the installed Home Screen app: Apple only allows Push there
 *   denied             the user blocked notifications in the browser: we never prompt again
 *   default            permission not asked yet: show the explicit "enable" button
 *   granted            permission given
 */
export type PushSupportState = 'unconfigured' | 'unsupported' | 'ios-needs-install' | 'denied' | 'default' | 'granted';

export interface PushCapabilities {
  hasVapidKey: boolean;
  isSecureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: 'default' | 'granted' | 'denied' | null;
  userAgent: string;
  maxTouchPoints: number;
  /** Running as an installed web app (Home Screen), not in a browser tab. */
  standalone: boolean;
}

export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS 13+ reports a desktop Mac user agent.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export function detectPushSupport(c: PushCapabilities): PushSupportState {
  if (!c.hasVapidKey) return 'unconfigured';
  const ios = isIosDevice(c.userAgent, c.maxTouchPoints);
  if (ios && !c.standalone) return 'ios-needs-install';
  if (!c.isSecureContext || !c.hasServiceWorker || !c.hasPushManager || !c.hasNotification) return 'unsupported';
  if (c.permission === 'denied') return 'denied';
  if (c.permission === 'granted') return 'granted';
  return 'default';
}

/** VAPID public key (URL-safe base64) -> the bytes `pushManager.subscribe` expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
