import { describe, expect, it } from 'vitest';
import { greetingHe, israelHour } from '@/lib/time';

describe('greetingHe (Israel local time)', () => {
  it('uses Israel time, including daylight saving', () => {
    // 2026-07-01 is UTC+3, 2026-12-01 is UTC+2.
    expect(israelHour(new Date('2026-07-01T05:00:00Z'))).toBe(8);
    expect(israelHour(new Date('2026-12-01T05:00:00Z'))).toBe(7);
    expect(israelHour(new Date('2026-12-01T22:30:00Z'))).toBe(0); // midnight, not 24
  });

  it('picks the greeting by hour', () => {
    expect(greetingHe(new Date('2026-12-01T05:00:00Z'))).toEqual({ text: 'בוקר טוב' });
    expect(greetingHe(new Date('2026-12-01T11:00:00Z')).text).toBe('צהריים טובים');
    expect(greetingHe(new Date('2026-12-01T16:00:00Z')).text).toBe('ערב טוב');
    expect(greetingHe(new Date('2026-12-01T22:30:00Z')).text).toBe('לילה טוב');
  });
});
