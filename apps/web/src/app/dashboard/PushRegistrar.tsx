'use client';

/**
 * Registers the service worker and subscribes this browser to push, so a
 * teacher's call reaches a laptop whose tab is closed.
 *
 * Asked for on the dashboard rather than on first page load: a permission
 * prompt that appears before someone has signed in gets refused, and a refused
 * prompt in Chrome is close to permanent — the browser stops asking. So the
 * prompt waits until they are logged in and on their own dashboard, where a
 * request to be told about classes makes sense.
 *
 * Failure is silent by design. Push here is an upgrade on the existing poll,
 * not a replacement: `IncomingCallOverlay` still rings any open tab.
 */

import { useEffect } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function PushRegistrar() {
  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        if (cancelled) return;

        // Never prompt twice. 'denied' is final until the user changes it in
        // browser settings, and asking again does nothing but annoy.
        if (Notification.permission === 'denied') return;
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission();
          if (result !== 'granted') return;
        }

        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            // Chrome refuses a subscription without this, even though our
            // pushes carry no payload.
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
          }));

        if (cancelled) return;

        // Re-sent on every dashboard load, which is what keeps the row
        // pointing at the person actually signed in on a shared computer.
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch (error) {
        console.debug('Push registration skipped:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
