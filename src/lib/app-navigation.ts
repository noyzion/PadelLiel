/**
 * Decide whether a click / form submit is about to leave the current page, so the UI can show
 * a pending state immediately (Next still waits for the server before swapping the route).
 */

export function isPendingNavigation(currentHref: string, nextHref: string): boolean {
  let current: URL;
  let next: URL;
  try {
    current = new URL(currentHref);
    next = new URL(nextHref, current);
  } catch {
    return false;
  }
  if (next.origin !== current.origin) return false;
  return next.pathname !== current.pathname || next.search !== current.search;
}

export function shouldMarkNavigationStart(opts: {
  href: string | null;
  currentHref: string;
  target: string | null;
  download: boolean;
  modifiedClick: boolean;
}): boolean {
  if (opts.modifiedClick || opts.download) return false;
  if (opts.target && opts.target !== '_self') return false;
  if (!opts.href) return false;
  if (/^(mailto|tel|sms|javascript):/i.test(opts.href)) return false;
  return isPendingNavigation(opts.currentHref, opts.href);
}
