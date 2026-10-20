import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES_HE, blockReasonHe, errorMessageHe, isErrorCode, toAppError } from '@/lib/domain/errors';
import { generateWeekSessions } from '@/lib/domain/schedule-generator';
import { buildWeeklyWhatsAppMessage, scheduleLink, whatsappShareUrl } from '@/lib/domain/whatsapp';
import {
  adjustAllowanceSchema,
  assignSubscriptionSchema,
  bulkCreateSchema,
  loginSchema,
  registerSchema,
  sessionFormSchema,
  settingsSchema,
  subscriptionValiditySchema,
  updateMemberSchema,
} from '@/lib/validation/schemas';
import fs from 'node:fs';
import path from 'node:path';

describe('error mapping', () => {
  it('maps database business errors (P0001) to codes and Hebrew text', () => {
    const err = toAppError({ code: 'P0001', message: 'SESSION_FULL' });
    expect(err.code).toBe('SESSION_FULL');
    expect(errorMessageHe(err.code)).toBe(ERROR_MESSAGES_HE.SESSION_FULL);
  });

  it('never leaks unknown database errors to the user', () => {
    const err = toAppError({ code: 'XX000', message: 'relation "secret" does not exist' });
    expect(err.code).toBe('INTERNAL');
    expect(errorMessageHe(err.code)).not.toContain('secret');
    expect(errorMessageHe('whatever')).toBe(ERROR_MESSAGES_HE.INTERNAL);
    expect(toAppError({ code: 'P0001', message: 'SOMETHING_UNKNOWN' }).code).toBe('INTERNAL');
  });

  it('maps permission and constraint errors', () => {
    expect(toAppError({ code: '42501', message: 'permission denied' }).code).toBe('NOT_AUTHORIZED');
    expect(toAppError({ code: '23514', message: 'check' }).code).toBe('INVALID_INPUT');
  });

  it('knows every error code the SQL migrations can raise', () => {
    const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
    const sql = fs
      .readdirSync(dir)
      .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
      .join('\n');
    const raised = new Set([...sql.matchAll(/app_error\('([A-Z_]+)'\)/g)].map((m) => m[1]));
    expect(raised.size).toBeGreaterThan(20);
    for (const code of raised) expect(isErrorCode(code), `${code} has no Hebrew message`).toBe(true);
  });

  it('explains block reasons for disabled buttons', () => {
    expect(blockReasonHe(null)).toBeNull();
    expect(blockReasonHe('NO_ALLOWANCE_REMAINING')).toContain('מכסה');
    expect(blockReasonHe('SKILL_LEVEL_MISMATCH')).toContain('גבוהה');
  });
});

describe('weekly schedule generator', () => {
  it('expands weekdays × slots into one draft row per slot (a single court, no parallel levels)', () => {
    const rows = generateWeekSessions({
      weekStart: '2026-11-04', // any day of the week is normalised to its Sunday
      weekdays: [1, 3, 1],
      slots: [
        { start: '07:00', end: '08:00' },
        { start: '08:00', end: '09:00' },
      ],
      level: 'beginner',
      capacity: 4,
    });
    expect(rows).toHaveLength(2 * 2);
    expect(new Set(rows.map((r) => `${r.session_date} ${r.start_time}`)).size).toBe(rows.length); // no two sessions at once
    expect(rows[0]).toEqual({
      session_date: '2026-11-02',
      start_time: '07:00',
      end_time: '08:00',
      skill_level_code: 'beginner',
      capacity: 4,
      status: 'DRAFT',
    });
    expect(new Set(rows.map((r) => r.session_date))).toEqual(new Set(['2026-11-02', '2026-11-04']));
  });

  it('ignores invalid weekday numbers', () => {
    const rows = generateWeekSessions({
      weekStart: '2026-11-01',
      weekdays: [-1, 7, 2.5, 0],
      slots: [{ start: '07:00', end: '08:00' }],
      level: 'beginner',
      capacity: 4,
    });
    expect(rows.map((r) => r.session_date)).toEqual(['2026-11-01']);
  });
});

describe('WhatsApp message', () => {
  it('contains the week dates, the booking link and the configured cutoff', () => {
    const link = scheduleLink('https://padel.example.com/', '2026-11-04');
    expect(link).toBe('https://padel.example.com/schedule?week=2026-11-01');
    const msg = buildWeeklyWhatsAppMessage({ weekStart: '2026-11-04', bookingUrl: link, cancellationCutoffHours: 6 });
    expect(msg).toContain('1.11-7.11');
    expect(msg).toContain(link);
    expect(msg).toContain('6 שעות');
    expect(whatsappShareUrl(msg)).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});

describe('input validation', () => {
  it('registration needs a name, an Israeli mobile number and a strong-enough password (no e-mail)', () => {
    const ok = registerSchema.safeParse({ fullName: ' דנה כהן ', phone: '050-123-4567', password: 'password1' });
    expect(ok.success && ok.data).toEqual({ fullName: 'דנה כהן', phone: '+972501234567', password: 'password1' });
    expect(registerSchema.safeParse({ fullName: 'ד', phone: '050-123-4567', password: 'password1' }).success).toBe(false);
    expect(registerSchema.safeParse({ fullName: 'דנה', phone: '050', password: 'password1' }).success).toBe(false);
    expect(registerSchema.safeParse({ fullName: 'דנה', phone: '03-123-4567', password: 'password1' }).success).toBe(false);
    expect(registerSchema.safeParse({ fullName: 'דנה', phone: 'abc-defgh', password: 'password1' }).success).toBe(false);
    expect(registerSchema.safeParse({ fullName: 'דנה', phone: '050-123-4567', password: '1' }).success).toBe(false);
  });

  it('login takes a phone number in any format (no e-mail) and a password', () => {
    const ok = loginSchema.safeParse({ phone: '050 123 4567', password: 'x' });
    expect(ok.success && ok.data.phone).toBe('+972501234567');
    expect(loginSchema.safeParse({ phone: 'coach@example.com', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: 'not a number', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: '050-123-4567', password: '' }).success).toBe(false);
  });

  it('session form validates times, capacity and ordering', () => {
    const base = { date: '2026-11-02', start: '07:00', end: '08:00', level: 'beginner', capacity: '4', registrationOpen: true };
    expect(sessionFormSchema.safeParse(base).success).toBe(true);
    expect(sessionFormSchema.safeParse({ ...base, end: '06:00' }).success).toBe(false);
    expect(sessionFormSchema.safeParse({ ...base, capacity: 0 }).success).toBe(false);
    expect(sessionFormSchema.safeParse({ ...base, date: '2026-02-31' }).success).toBe(false);
    expect(sessionFormSchema.safeParse({ ...base, start: '7:00' }).success).toBe(false);
  });

  it('bulk creation needs at least one day and slot, one level, and no overlapping slots', () => {
    const base = { weekStart: '2026-11-01', weekdays: [1], slots: [{ start: '07:00', end: '08:00' }], level: 'beginner', capacity: 4 };
    expect(bulkCreateSchema.safeParse(base).success).toBe(true);
    expect(bulkCreateSchema.safeParse({ ...base, weekdays: [] }).success).toBe(false);
    expect(bulkCreateSchema.safeParse({ ...base, slots: [{ start: '09:00', end: '08:00' }] }).success).toBe(false);
    expect(bulkCreateSchema.safeParse({ ...base, levels: ['beginner'], level: undefined }).success).toBe(false);
    const backToBack = [
      { start: '07:00', end: '08:00' },
      { start: '08:00', end: '09:00' },
    ];
    expect(bulkCreateSchema.safeParse({ ...base, slots: backToBack }).success).toBe(true);
    const overlapping = [
      { start: '07:00', end: '08:00' },
      { start: '07:30', end: '08:30' },
    ];
    expect(bulkCreateSchema.safeParse({ ...base, slots: overlapping }).success).toBe(false);
  });

  it('allowance adjustments need a non-zero delta and a reason', () => {
    const base = { memberId: '11111111-1111-4111-8111-111111111111', monthStart: '2026-11-01', delta: 1, reason: 'פיצוי' };
    expect(adjustAllowanceSchema.safeParse(base).success).toBe(true);
    expect(adjustAllowanceSchema.safeParse({ ...base, delta: 0 }).success).toBe(false);
    expect(adjustAllowanceSchema.safeParse({ ...base, reason: ' ' }).success).toBe(false);
  });

  it('member patches reject unknown fields (no mass assignment of role etc.)', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(updateMemberSchema.safeParse({ memberId: id, patch: { approval_status: 'approved' } }).success).toBe(true);
    expect(updateMemberSchema.safeParse({ memberId: id, patch: { role: 'admin' } }).success).toBe(false);
  });

  it('assigning a plan does not take an end date', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(assignSubscriptionSchema.safeParse({ memberId: id, planId: id }).success).toBe(true);
    expect(assignSubscriptionSchema.safeParse({ memberId: id, planId: id, startsOn: '2026-11-01' }).success).toBe(true);
    expect(assignSubscriptionSchema.safeParse({ memberId: id, planId: id, startsOn: '2026-11-01', endsOn: '2026-12-01' }).success).toBe(false);
  });

  it('subscription validity must be ordered', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(subscriptionValiditySchema.safeParse({ subscriptionId: id, startsOn: '2026-11-01', endsOn: '2026-10-01' }).success).toBe(false);
    expect(subscriptionValiditySchema.safeParse({ subscriptionId: id, startsOn: '2026-11-01' }).success).toBe(true);
  });

  it('settings bound the cancellation cutoff', () => {
    const base = { cancellationCutoffHours: '8', defaultCapacity: '4', defaultTimeSlots: [{ start: '07:00', end: '08:00' }] };
    expect(settingsSchema.safeParse(base).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, cancellationCutoffHours: '-1' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, cancellationCutoffHours: '200' }).success).toBe(false);
  });
});
