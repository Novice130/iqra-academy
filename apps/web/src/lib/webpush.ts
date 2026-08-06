/**
 * @fileoverview Web Push (VAPID) that runs on Cloudflare Workers.
 *
 * `src/lib/push.ts` was written against the `web-push` npm package, which
 * needs Node's crypto and therefore cannot run here at all. This is the same
 * job done with Web Crypto.
 *
 * **Payload-less on purpose.** Encrypting a push payload means implementing
 * aes128gcm with an ECDH shared secret per subscription — a lot of fiddly
 * cryptography to carry a few fields. Instead the push carries nothing, and
 * the service worker asks `/api/calls/incoming` what happened. The browser is
 * already authenticated there, so nothing sensitive travels through Google's
 * or Mozilla's push service, and there is no ciphertext to get wrong.
 *
 * What this can and cannot do: it wakes the browser and posts a notification
 * even with the tab closed. It cannot play a ringtone on a loop — that needs a
 * page, which is what `IncomingCallOverlay` does when the site is open. So a
 * closed laptop gets a persistent notification, not a ringing sound.
 */

import { db } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";

const DEFAULT_SUBJECT = "mailto:admin@novicetutor.com";

function config() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT || DEFAULT_SUBJECT,
  };
}

export function isWebPushConfigured(): boolean {
  return config() !== null;
}

function b64urlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The VAPID private key is a raw `d` scalar; Web Crypto wants a JWK, and a JWK
 * private key must carry its public half too — so it is rebuilt from the
 * public key's uncompressed point (0x04 ‖ X ‖ Y).
 */
async function importVapidKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = b64urlToBytes(publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  }
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      d: privateKey,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

/** Signed JWT proving to the push service which application server we are. */
async function vapidAuthHeader(endpoint: string): Promise<{ jwt: string; publicKey: string }> {
  const cfg = config()!;
  const audience = new URL(endpoint).origin;

  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: audience,
        // 12 hours: push services reject anything more than 24 ahead.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: cfg.subject,
      })
    )
  );

  const key = await importVapidKey(cfg.publicKey, cfg.privateKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );

  return { jwt: `${header}.${payload}.${bytesToB64url(signature)}`, publicKey: cfg.publicKey };
}

/**
 * Wake every browser these users have registered.
 *
 * Never throws — a ring must not fail because a push service is down. `ttl`
 * is short for calls: a notification about a call that finished ten minutes
 * ago is worse than no notification.
 */
export async function sendWebPushToUsers(userIds: string[], ttlSeconds = 45): Promise<number> {
  if (userIds.length === 0 || !isWebPushConfigured()) return 0;

  try {
    const subs = await db.query.pushSubscriptions.findMany({
      where: inArray(pushSubscriptions.userId, userIds),
      columns: { id: true, endpoint: true },
    });
    if (subs.length === 0) return 0;

    const dead: string[] = [];
    let sent = 0;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          const { jwt, publicKey } = await vapidAuthHeader(sub.endpoint);
          const res = await fetch(sub.endpoint, {
            method: "POST",
            headers: {
              TTL: String(ttlSeconds),
              Urgency: "high",
              Authorization: `vapid t=${jwt}, k=${publicKey}`,
              // No body, so tell the push service explicitly.
              "Content-Length": "0",
            },
          });

          if (res.ok || res.status === 201) {
            sent++;
            return;
          }
          // The browser was uninstalled, cleared, or unsubscribed. Keeping the
          // row means retrying a dead endpoint on every call forever.
          if (res.status === 404 || res.status === 410) {
            dead.push(sub.id);
          } else {
            console.error("[webpush] send failed", res.status, await res.text());
          }
        } catch (error) {
          console.error("[webpush] send threw", error);
        }
      })
    );

    if (dead.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
    }

    return sent;
  } catch (error) {
    console.error("[webpush] failed", error);
    return 0;
  }
}

/** Remove one subscription (browser unsubscribed, or signed out). */
export async function removeSubscription(endpoint: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
