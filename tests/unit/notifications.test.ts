import { describe, expect, it, vi } from 'vitest';
import { buildBookingIcs, escapeIcsText, foldIcsLine } from '@/lib/domain/calendar';
import {
  buildPushPayload,
  classifyPushFailure,
  notificationHref,
  pushTtlSeconds,
  safeDestination,
} from '@/lib/domain/notifications';
import { detectPushSupport, isIosDevice, urlBase64ToUint8Array, type PushCapabilities } from '@/lib/push-support';
import { preferencesPatchSchema, pushSubscriptionSchema } from '@/lib/validation/notification-schemas';

vi.mock('server-only', () => ({}));

const { deliverJob, runDispatch } = await import('@/server/notifications/dispatcher');
type ClaimedJob = import('@/server/notifications/dispatcher').ClaimedJob;

describe('notification destinations', () => {
  it('only ever points inside this site', () => {
    expect(safeDestination('/bookings')).toBe('/bookings');
    expect(safeDestination('/schedule?week=2026-11-01')).toBe('/schedule?week=2026-11-01');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/a\tb', '', null, undefined, 42]) {
      expect(safeDestination(bad)).toBe('/notifications');
    }
    expect(notificationHref(null)).toBeNull();
    expect(notificationHref('//evil.example')).toBe('/notifications');
  });

  it('builds a minimal push payload with a safe url', () => {
    const payload = buildPushPayload({ notification_id: 'n1', title: 'כותרת', message: 'גוף', url: 'https://evil.example' });
    expect(payload).toEqual({ id: 'n1', title: 'כותרת', body: 'גוף', url: '/notifications' });
    expect(Object.keys(payload).sort()).toEqual(['body', 'id', 'title', 'url']);
  });

  it('lets time-critical reminders expire quickly', () => {
    expect(pushTtlSeconds('cancellation_deadline')).toBe(1800);
    expect(pushTtlSeconds('training_reminder')).toBe(7200);
    expect(pushTtlSeconds('booking_confirmed')).toBe(86400);
  });

  it('classifies push failures', () => {
    expect(classifyPushFailure(404)).toBe('gone');
    expect(classifyPushFailure(410)).toBe('gone');
    expect(classifyPushFailure(403)).toBe('gone');
    expect(classifyPushFailure(400)).toBe('permanent');
    expect(classifyPushFailure(413)).toBe('permanent');
    expect(classifyPushFailure(429)).toBe('retry');
    expect(classifyPushFailure(500)).toBe('retry');
    expect(classifyPushFailure(401)).toBe('retry'); // our own configuration problem: never delete devices for it
    expect(classifyPushFailure(undefined)).toBe('retry'); // network error
  });
});

describe('push support detection', () => {
  const desktop: PushCapabilities = {
    hasVapidKey: true,
    isSecureContext: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    permission: 'default',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130',
    maxTouchPoints: 5,
    standalone: false,
  };
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/605', maxTouchPoints: 5 };

  it('asks only when permission was never requested, and never prompts again after a denial', () => {
    expect(detectPushSupport(desktop)).toBe('default');
    expect(detectPushSupport({ ...desktop, permission: 'granted' })).toBe('granted');
    expect(detectPushSupport({ ...desktop, permission: 'denied' })).toBe('denied');
  });

  it('is unsupported without the browser APIs or a secure context, and unconfigured without a VAPID key', () => {
    expect(detectPushSupport({ ...desktop, hasPushManager: false })).toBe('unsupported');
    expect(detectPushSupport({ ...desktop, hasServiceWorker: false })).toBe('unsupported');
    expect(detectPushSupport({ ...desktop, hasNotification: false, permission: null })).toBe('unsupported');
    expect(detectPushSupport({ ...desktop, isSecureContext: false })).toBe('unsupported');
    expect(detectPushSupport({ ...desktop, hasVapidKey: false })).toBe('unconfigured');
  });

  it('iPhone: needs the Home Screen app first; inside it Push follows the normal flow', () => {
    expect(detectPushSupport({ ...desktop, ...iphone, hasPushManager: false })).toBe('ios-needs-install');
    expect(detectPushSupport({ ...desktop, ...iphone, hasPushManager: true })).toBe('ios-needs-install');
    expect(detectPushSupport({ ...desktop, ...iphone, standalone: true })).toBe('default');
    expect(detectPushSupport({ ...desktop, ...iphone, standalone: true, hasPushManager: false })).toBe('unsupported'); // iOS < 16.4
  });

  it('recognises iPadOS (desktop user agent with touch)', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Windows NT 10.0) Chrome', 0)).toBe(false);
  });

  it('decodes the VAPID public key', () => {
    const bytes = urlBase64ToUint8Array('AQID-_8'); // 01 02 03 fb ff
    expect(Array.from(bytes)).toEqual([1, 2, 3, 251, 255]);
  });
});

describe('notification action validation', () => {
  it('accepts a real subscription and rejects insecure or oversized ones', () => {
    const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'BKey', auth: 'secret', userAgent: 'UA' };
    expect(pushSubscriptionSchema.safeParse(good).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ ...good, endpoint: 'http://push.example/x' }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...good, endpoint: 'javascript:alert(1)' }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...good, auth: '' }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...good, p256dh: 'x'.repeat(300) }).success).toBe(false);
  });

  it('only accepts known preference keys', () => {
    expect(preferencesPatchSchema.safeParse({ weeklySchedule: false }).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(preferencesPatchSchema.safeParse({ pushEnabled: 'yes' }).success).toBe(false);
  });
});

describe('add to calendar (.ics)', () => {
  const ics = buildBookingIcs(
    { bookingId: '11111111-2222-3333-4444-555555555555', sessionDate: '2026-11-02', startTime: '07:00:00', endTime: '08:00:00' },
    new Date('2026-10-29T07:00:00Z'),
  );

  it('is a valid iCalendar with Israel time zone information', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;TZID=Asia/Jerusalem:20261102T070000');
    expect(ics).toContain('DTEND;TZID=Asia/Jerusalem:20261102T080000');
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Asia/Jerusalem');
    expect(ics).toContain('UID:booking-11111111-2222-3333-4444-555555555555@padelliel');
    expect(ics).toContain('DTSTAMP:20261029T070000Z');
    expect(ics).toContain('LOCATION:מרכז הטניס כוכב יאיר');
    expect(ics).toContain('SUMMARY:אימון פאדל');
    expect(ics).not.toMatch(/[^\r]\n/); // CRLF only
  });

  it('keeps every line within 75 octets and does not split multi-byte characters', () => {
    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('DESCRIPTION:האימון נקבע דרך אפליקציית האימונים.');
    expect(unfolded).not.toContain('\uFFFD');
  });

  it('escapes text and folds long lines losslessly', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const long = 'DESCRIPTION:' + 'שלום '.repeat(40);
    const folded = foldIcsLine(long);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
});

describe('dispatcher', () => {
  const job = (overrides: Partial<ClaimedJob> = {}): ClaimedJob => ({
    job_id: 'job-1',
    notification_id: 'n-1',
    user_id: 'u-1',
    type: 'training_reminder',
    title: 'מחר נפגשות על המגרש',
    message: 'מחר בשעה 07:00 מחכה לך אימון פאדל. נתראה!',
    url: '/bookings',
    subscriptions: [
      { id: 's1', endpoint: 'https://push.test/1', p256dh: 'k', auth: 'a' },
      { id: 's2', endpoint: 'https://push.test/2', p256dh: 'k', auth: 'a' },
    ],
    ...overrides,
  });
  const fail = (statusCode?: number) => Object.assign(new Error('push failed'), { statusCode });

  it('delivers to every device with the minimal payload and a short TTL for time-critical types', async () => {
    const sent: { id: string; payload: string; ttl: number }[] = [];
    const outcome = await deliverJob(job({ type: 'cancellation_deadline' }), async (t, payload, { ttl }) => {
      sent.push({ id: t.id, payload, ttl });
    });
    expect(outcome).toEqual({ delivered: expect.arrayContaining(['s1', 's2']), retry: [], gone: [] });
    expect(sent.map((s) => s.ttl)).toEqual([1800, 1800]);
    expect(JSON.parse(sent[0].payload)).toEqual({
      id: 'n-1',
      title: 'מחר נפגשות על המגרש',
      body: 'מחר בשעה 07:00 מחכה לך אימון פאדל. נתראה!',
      url: '/bookings',
    });
  });

  it('handles multiple devices independently: expired removed, transient retried, delivered untouched', async () => {
    const outcome = await deliverJob(
      job({ subscriptions: [...job().subscriptions, { id: 's3', endpoint: 'https://push.test/3', p256dh: 'k', auth: 'a' }, { id: 's4', endpoint: 'https://push.test/4', p256dh: 'k', auth: 'a' }] }),
      async (t) => {
        if (t.id === 's1') return;
        if (t.id === 's2') throw fail(410);
        if (t.id === 's3') throw fail(503);
        throw fail(400);
      },
    );
    expect(outcome.delivered).toEqual(['s1']);
    expect(outcome.gone).toEqual(['s2']);
    expect(outcome.retry).toEqual(['s3']);
    expect(outcome.error).toContain('gone HTTP 410');
    expect(outcome.error).toContain('retry HTTP 503');
    expect(outcome.error).toContain('permanent HTTP 400');
  });

  it('runs until the queue is empty, reports every outcome once and never sends twice', async () => {
    const queue = [job({ job_id: 'a' }), job({ job_id: 'b' }), job({ job_id: 'c' })];
    const completed: string[] = [];
    const send = vi.fn(async () => {});
    const summary = await runDispatch(
      {
        claim: async (limit) => queue.splice(0, limit),
        complete: async (id) => void completed.push(id),
        send,
      },
      { batchSize: 2 },
    );
    expect(completed).toEqual(['a', 'b', 'c']);
    expect(send).toHaveBeenCalledTimes(6);
    expect(summary).toMatchObject({ claimed: 3, delivered: 6, retried: 0, removed: 0, rejected: 0 });
  });

  it('stops when the time budget is used up (the next scheduled run continues)', async () => {
    let clock = 0;
    const queue = Array.from({ length: 10 }, (_, i) => job({ job_id: `j${i}` }));
    const completed: string[] = [];
    await runDispatch(
      {
        claim: async (limit) => queue.splice(0, limit),
        complete: async (id) => void completed.push(id),
        send: async () => {
          clock += 30_000;
        },
      },
      { batchSize: 1, budgetMs: 50_000, now: () => clock },
    );
    expect(completed.length).toBeLessThan(10);
    expect(queue.length).toBeGreaterThan(0);
  });
});
