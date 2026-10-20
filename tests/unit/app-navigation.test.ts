import { describe, expect, it } from 'vitest';
import { isPendingNavigation, shouldMarkNavigationStart } from '@/lib/app-navigation';

const here = 'https://app.example/admin/members';

describe('isPendingNavigation', () => {
  it('detects a move to another path', () => {
    expect(isPendingNavigation(here, '/admin/members/abc')).toBe(true);
    expect(isPendingNavigation(here, 'https://app.example/admin/sessions/1')).toBe(true);
  });

  it('detects a query change on the same path', () => {
    expect(isPendingNavigation(here, '/admin/members?status=pending')).toBe(true);
  });

  it('ignores the current page, hash-only jumps, and other origins', () => {
    expect(isPendingNavigation(here, '/admin/members')).toBe(false);
    expect(isPendingNavigation(here, '/admin/members#top')).toBe(false);
    expect(isPendingNavigation(here, 'https://evil.example/admin/members/abc')).toBe(false);
    expect(isPendingNavigation('not a url', '/admin')).toBe(false);
  });
});

describe('shouldMarkNavigationStart', () => {
  const start = (patch: Partial<Parameters<typeof shouldMarkNavigationStart>[0]>) =>
    shouldMarkNavigationStart({
      href: '/admin/sessions/1',
      currentHref: here,
      target: null,
      download: false,
      modifiedClick: false,
      ...patch,
    });

  it('marks a plain in-app click', () => {
    expect(start({})).toBe(true);
  });

  it('skips modified clicks, downloads, new tabs and non-http schemes', () => {
    expect(start({ modifiedClick: true })).toBe(false);
    expect(start({ download: true })).toBe(false);
    expect(start({ target: '_blank' })).toBe(false);
    expect(start({ href: 'mailto:a@b.c' })).toBe(false);
    expect(start({ href: null })).toBe(false);
  });
});
