/**
 * Service worker — the only part of the site that runs with the tab closed.
 *
 * The push it receives is deliberately empty (see src/lib/webpush.ts), so the
 * first thing it does is ask the server what is going on. That keeps call
 * details out of Google's and Mozilla's push infrastructure, and means a push
 * that arrives late shows nothing rather than a stale "your teacher is
 * calling" for a call that ended.
 */

const CALL_TAG = 'novice-tutor-call';
const STATIC_CACHE = 'novice-tutor-static-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions of this worker.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== STATIC_CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

/**
 * Cache-first for build assets only.
 *
 * Everything under /_next/static/ carries a content hash in its filename, so a
 * cached copy can never be stale — a new build produces new URLs. Serving them
 * from disk is what stops the app re-downloading the whole JS bundle over
 * mobile data on every screen, which is most of why it felt slow.
 *
 * Pages and API calls are deliberately untouched: caching a dashboard would
 * show yesterday's classes, and caching /api/calls/incoming would ring for a
 * call that already ended.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isImmutable =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/logo.png' ||
    url.pathname === '/favicon.ico';
  if (!isImmutable) return;

  event.respondWith(
    (async () => {
      // Every cache operation below is best-effort. When the disk is full,
      // `cache.put` rejects part-way through a write and Cache Storage can
      // start handing back entries that no longer load. An unguarded read of
      // one of those serves a broken JS chunk: the server-rendered HTML
      // paints, hydration dies on it, and the user gets a white page on a
      // site whose server is perfectly healthy. Falling back to the network
      // is always correct here — these assets are content-hashed, so the
      // cache is a speed optimisation and never a source of truth.
      try {
        const cached = await caches.match(request);
        if (cached) return cached;
      } catch {
        // Unreadable cache. Go to the network.
      }

      const response = await fetch(request);
      if (response.ok) {
        try {
          const cache = await caches.open(STATIC_CACHE);
          // Awaited so a failed write is caught here rather than surfacing as
          // an unhandled rejection inside the worker.
          await cache.put(request, response.clone());
        } catch {
          // Out of disk or over quota. Serving the response is what matters;
          // storing it is not.
        }
      }
      return response;
    })()
  );
});

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush());
});

async function handlePush() {
  let call = null;
  try {
    const res = await fetch('/api/calls/incoming', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      call = data.call || null;
    }
  } catch {
    // Offline or signed out — fall through to the generic notification below.
  }

  // Nothing ringing any more: the teacher hung up, or they answered on their
  // phone. Clear anything we already showed instead of adding to it.
  if (!call) {
    const shown = await self.registration.getNotifications({ tag: CALL_TAG });
    shown.forEach((n) => n.close());
    return;
  }

  const caller = call.callerName || 'Your teacher';
  await self.registration.showNotification(`${caller} is calling`, {
    body: 'Tap to join your Quran class',
    tag: CALL_TAG,
    // Stays on screen until acted on — a call is not a "seen it, moving on"
    // notification.
    requireInteraction: true,
    renotify: true,
    vibrate: [400, 200, 400, 200, 400],
    icon: '/logo.png',
    badge: '/logo.png',
    data: { sessionId: call.sessionId, callId: call.id },
    actions: [
      { action: 'answer', title: 'Answer' },
      { action: 'decline', title: 'Decline' },
    ],
  });
}

self.addEventListener('notificationclick', (event) => {
  const { sessionId, callId } = event.notification.data || {};
  event.notification.close();

  if (event.action === 'decline') {
    event.waitUntil(
      fetch(`/api/calls/${callId}/decline`, { method: 'POST', credentials: 'include' }).catch(() => {})
    );
    return;
  }

  const target = `/dashboard/session/${sessionId}?answer=1`;
  event.waitUntil(
    (async () => {
      // Reuse a tab that is already on the site rather than piling up windows.
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = tabs.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        await existing.focus();
        await existing.navigate(target).catch(() => {});
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});
