import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-redirect';

describe('safeNext', () => {
  it('keeps same-site relative paths', () => {
    expect(safeNext('/')).toBe('/');
    expect(safeNext('/schedule?week=2026-10-18')).toBe('/schedule?week=2026-10-18');
    expect(safeNext('/admin/members/abc#top')).toBe('/admin/members/abc#top');
  });

  it('falls back for empty and non-string input', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('')).toBe('/');
    expect(safeNext(42)).toBe('/');
    expect(safeNext(new File([], 'x'))).toBe('/');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    for (const bad of ['https://evil.com', 'http://evil.com/x', '//evil.com', '///evil.com', 'javascript:alert(1)', 'evil.com']) {
      expect(safeNext(bad), bad).toBe('/');
    }
  });

  it('rejects backslash tricks', () => {
    for (const bad of ['/\\evil.com', '/\\/evil.com', '\\\\evil.com']) {
      expect(safeNext(bad), bad).toBe('/');
    }
  });

  it('rejects tab / newline / control characters that browsers strip (becoming "//evil.com")', () => {
    for (const bad of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\u0000/evil.com', '/\u001f/evil.com', '/ok\u007f']) {
      expect(safeNext(bad), bad).toBe('/');
    }
  });

  it('uses the given fallback', () => {
    expect(safeNext('//evil.com', '/login')).toBe('/login');
  });
});
