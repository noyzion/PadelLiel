import { describe, expect, it } from 'vitest';
import { formatIsraeliPhone, normalizeIsraeliMobile } from '@/lib/phone';

describe('normalizeIsraeliMobile', () => {
  it.each([
    '0501234567',
    '050-123-4567',
    '050 123 4567',
    '(050) 123-4567',
    '501234567',
    '+972501234567',
    '+972 50-123-4567',
    '+972 (0) 50 123 4567',
    '972501234567',
    '00972501234567',
    '  050-123-4567  ',
  ])('turns %j into E.164', (input) => {
    expect(normalizeIsraeliMobile(input)).toBe('+972501234567');
  });

  it('accepts every common mobile prefix', () => {
    for (const prefix of ['050', '052', '053', '054', '055', '058']) {
      expect(normalizeIsraeliMobile(`${prefix}-765-4321`)).toBe(`+972${prefix.slice(1)}7654321`);
    }
  });

  it.each([
    ['', 'empty'],
    ['abc', 'letters'],
    ['050-123-456', 'too short'],
    ['050-123-45678', 'too long'],
    ['03-123-4567', 'a landline'],
    ['02-123-4567', 'a landline'],
    ['+1 415 555 2671', 'another country'],
    ['+44 7911 123456', 'another country'],
    ['050-123-4567x', 'trailing letters'],
    ['050+1234567', 'a plus inside the number'],
    ['0000000000', 'zeros'],
  ])('rejects %j (%s)', (input) => {
    expect(normalizeIsraeliMobile(input)).toBeNull();
  });
});

describe('formatIsraeliPhone', () => {
  it('shows an E.164 number the way Israelis write it', () => {
    expect(formatIsraeliPhone('+972501234567')).toBe('050-123-4567');
    expect(formatIsraeliPhone('+972541234567')).toBe('054-123-4567');
  });

  it('leaves anything else untouched and tolerates empty values', () => {
    expect(formatIsraeliPhone('052-1234567')).toBe('052-1234567');
    expect(formatIsraeliPhone('+14155552671')).toBe('+14155552671');
    expect(formatIsraeliPhone(null)).toBe('');
    expect(formatIsraeliPhone(undefined)).toBe('');
  });
});
