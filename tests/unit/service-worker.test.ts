import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type Handler = (event: Record<string, unknown>) => void;

/** Loads the real public/sw.js into a sandbox that mimics the ServiceWorkerGlobalScope pieces it uses. */
function loadWorker(openClients: Array<{ url: string; focus: () => Promise<void>; navigate?: (u: string) => Promise<void>; postMessage: (m: unknown) => void }> = []) {
  const handlers: Record<string, Handler> = {};
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const opened: string[] = [];
  const self = {
    location: { origin: 'https://padel.example' },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    skipWaiting: vi.fn(),
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: async () => openClients,
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };
  const source = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
  vm.runInNewContext(source, { self, URL, console });
  return { handlers, shown, opened, self };
}

async function fire(handler: Handler, event: Record<string, unknown>) {
  let pending: Promise<unknown> | undefined;
  handler({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
}

describe('service worker (public/sw.js)', () => {
  it('shows the pushed notification with Hebrew RTL options and a same-site url', async () => {
    const message = vi.fn();
    const { handlers, shown } = loadWorker([{ url: 'https://padel.example/', focus: async () => undefined, postMessage: message }]);
    await fire(handlers.push, {
      data: { json: () => ({ id: 'n-1', title: 'האימון שלך בוטל', body: 'גוף ההודעה', url: '/bookings' }) },
    });
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('האימון שלך בוטל');
    expect(shown[0].options).toMatchObject({
      body: 'גוף ההודעה',
      dir: 'rtl',
      lang: 'he',
      tag: 'n-1',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: '/bookings' },
    });
    // Open pages are told to refresh their unread counter.
    expect(message).toHaveBeenCalledWith({ type: 'notification-received' });
  });

  it('falls back safely on empty, malformed or hostile payloads', async () => {
    const { handlers, shown } = loadWorker();
    await fire(handlers.push, { data: null });
    await fire(handlers.push, {
      data: {
        json: () => {
          throw new Error('not json');
        },
      },
    });
    await fire(handlers.push, { data: { json: () => ({ title: 'x', body: 'y', url: 'https://evil.example' }) } });
    await fire(handlers.push, { data: { json: () => ({ title: 'x', body: 'y', url: '//evil.example' }) } });
    expect(shown).toHaveLength(4);
    for (const n of shown) expect((n.options.data as { url: string }).url).toBe('/notifications');
    expect(shown[0].title).toBeTruthy();
  });

  it('click focuses an open window and navigates inside the site', async () => {
    const focus = vi.fn(async () => undefined);
    const navigate = vi.fn(async () => undefined);
    const { handlers, opened } = loadWorker([{ url: 'https://padel.example/schedule', focus, navigate, postMessage: () => undefined }]);
    const close = vi.fn();
    await fire(handlers.notificationclick, { notification: { close, data: { url: '/bookings' } } });
    expect(close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('https://padel.example/bookings');
    expect(opened).toHaveLength(0);
  });

  it('click opens a new window when the app is closed, never leaving the site', async () => {
    const { handlers, opened } = loadWorker([]);
    await fire(handlers.notificationclick, { notification: { close: () => undefined, data: { url: '/events/abc' } } });
    await fire(handlers.notificationclick, { notification: { close: () => undefined, data: { url: 'https://evil.example/x' } } });
    await fire(handlers.notificationclick, { notification: { close: () => undefined, data: undefined } });
    expect(opened).toEqual([
      'https://padel.example/events/abc',
      'https://padel.example/notifications',
      'https://padel.example/notifications',
    ]);
  });

  it('activates immediately and claims open pages', async () => {
    const { handlers, self } = loadWorker();
    handlers.install({});
    expect(self.skipWaiting).toHaveBeenCalled();
    await fire(handlers.activate, {});
    expect(self.clients.claim).toHaveBeenCalled();
  });
});
