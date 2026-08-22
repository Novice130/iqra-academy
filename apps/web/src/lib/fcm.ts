/**
 * @fileoverview Firebase Cloud Messaging — push to the mobile app.
 *
 * This is the one notification path that reaches a student who does not have
 * the site open. Everything else in the product polls: the dashboard banner
 * only fires while a tab is alive, so "the teacher started the class" never
 * arrives on a phone in a pocket. Tokens come from the mobile shell app via
 * POST /api/devices.
 *
 * FCM's legacy server key is gone, so this uses the HTTP v1 API, which wants
 * an OAuth2 access token signed by a service account. Cloudflare Workers has
 * no `crypto.createSign`, so the JWT is signed with Web Crypto (RS256) — that
 * is why this file does the assertion dance by hand rather than pulling in
 * firebase-admin, which does not run on Workers at all.
 *
 * Android and iOS do not take the same message. Android is told to wake the
 * app with a data-only push and draw the call screen itself; iOS cannot be
 * woken that way and gets an alert instead (the reasoning is at sendCallPush).
 * `device_tokens.platform` is what decides, which is why POST /api/devices
 * records it.
 *
 * Configuration (all optional — with none of it set, every send is a no-op and
 * the caller carries on):
 *   FCM_PROJECT_ID    — Firebase project id
 *   FCM_CLIENT_EMAIL  — service account email
 *   FCM_PRIVATE_KEY   — service account private key (PEM, \n-escaped is fine)
 */

import { db } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { deviceTokens } from "@/db/schema";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open when the notification is tapped. */
  path?: string;
  sessionId?: string;
}

/**
 * A ring, not a notification. Data-only and HIGH priority so Android delivers
 * it through Doze to an app that isn't running: the phone has to ring in a
 * pocket, which a normal notification cannot do. The app draws the incoming
 * call screen itself from this data — if we also sent a `notification` block,
 * Android would post its own silent tray item instead of waking the app.
 */
export interface CallPayload {
  callId: string;
  sessionId: string;
  callerName: string;
}

/** One registered handset. `platform` decides the shape of the message. */
interface Device {
  token: string;
  platform: string;
}

const isIos = (device: Device) => device.platform === "ios";

function config() {
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

/** Is push configured at all? Callers can skip the DB read if not. */
export function isPushConfigured(): boolean {
  return config() !== null;
}

function base64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PEM → CryptoKey. The header/footer and newlines are not base64. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Access tokens last an hour. A Worker isolate may live long enough to reuse
// one, and may not — either way this saves a round trip when it does.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  const key = await importPrivateKey(cfg.privateKey);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`)
  );
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    console.error("[fcm] token exchange failed", res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/**
 * Delivers one already-built FCM message body to every device of these users.
 *
 * Never throws: a class starting — or a teacher ringing a student — must not
 * fail because Google is having a bad afternoon. Returns how many devices
 * accepted it.
 */
async function sendToDevices(
  userIds: string[],
  build: (device: Device) => Record<string, unknown>
): Promise<number> {
  if (userIds.length === 0 || !isPushConfigured()) return 0;

  try {
    const cfg = config()!;
    const accessToken = await getAccessToken();
    if (!accessToken) return 0;

    const devices = await db.query.deviceTokens.findMany({
      where: inArray(deviceTokens.userId, userIds),
      columns: { token: true, userId: true, platform: true },
    });
    if (devices.length === 0) return 0;

    const url = `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`;
    const dead: string[] = [];
    let sent = 0;

    await Promise.all(
      devices.map(async (device) => {
        const message = { message: build(device) };

        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        if (res.ok) {
          sent++;
          return;
        }

        // 404/UNREGISTERED means the app was uninstalled or the token rotated.
        // Keeping it would mean retrying a dead device on every class forever.
        const text = await res.text();
        if (res.status === 404 || text.includes("UNREGISTERED")) {
          dead.push(device.token);
        } else {
          console.error("[fcm] send failed", res.status, text);
        }
      })
    );

    if (dead.length > 0) {
      await db.delete(deviceTokens).where(inArray(deviceTokens.token, dead));
    }

    return sent;
  } catch (error) {
    console.error("[fcm] push failed", error);
    return 0;
  }
}

/**
 * A tray notification — "your class has started". Tapping it opens `path`.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  return sendToDevices(userIds, (device) => ({
    token: device.token,
    notification: { title: payload.title, body: payload.body },
    // Data travels alongside the notification so the app knows where to go
    // when it is tapped — see PushService._pathOf.
    data: {
      ...(payload.path ? { path: payload.path } : {}),
      ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
    },
    android: {
      priority: "HIGH",
      notification: { channelId: "novice_tutor_default" },
    },
    // FCM turns the `notification` block above into an APNs alert on its own;
    // what it will not do is make a sound or interrupt, and a class starting
    // is worth interrupting for. `time-sensitive` is the level Apple intends
    // for exactly this and it needs no entitlement beyond push itself.
    ...(isIos(device)
      ? {
          apns: {
            headers: { "apns-priority": "10", "apns-push-type": "alert" },
            payload: { aps: { sound: "default", "interruption-level": "time-sensitive" } },
          },
        }
      : {}),
  }));
}

/**
 * Ring the student's phone. The app turns this into a full-screen incoming
 * call — ringtone, Accept/Decline, over the lock screen.
 *
 * Deliberately data-only: a `notification` block would make Android render
 * the message itself and never hand it to the app, which is the difference
 * between a phone that rings and a phone with an unread badge.
 */
export async function sendCallPush(userIds: string[], payload: CallPayload): Promise<number> {
  return sendToDevices(userIds, (device) => {
    const data = {
      type: "INCOMING_CALL",
      callId: payload.callId,
      sessionId: payload.sessionId,
      callerName: payload.callerName,
    };

    // iOS cannot be rung this way and no amount of payload tuning changes it.
    // A ringing phone means CallKit, CallKit means a PushKit VoIP push, and
    // FCM cannot send VoIP pushes at all — they go to APNs directly with their
    // own certificate. A silent data-only push is not a substitute either:
    // iOS throttles background pushes and will not deliver one to a terminated
    // app on any schedule a ringing teacher would accept.
    //
    // So iOS gets the honest degraded version: a loud, time-sensitive alert
    // saying who is calling, which opens straight into the call when tapped
    // (`?answer=1`, same as Accept on Android). The data rides along, so the
    // day PushKit is wired up the app already knows what to do with it.
    if (isIos(device)) {
      return {
        token: device.token,
        notification: {
          title: `${payload.callerName} is calling`,
          body: "Tap to join your Quran class",
        },
        data: { ...data, path: `/dashboard/session/${payload.sessionId}?answer=1` },
        apns: {
          headers: {
            "apns-priority": "10",
            "apns-push-type": "alert",
            // Same 45s as Android: a ring that arrives after the teacher gave
            // up is worse than one that never arrives.
            "apns-expiration": String(Math.floor(Date.now() / 1000) + 45),
          },
          payload: {
            aps: { sound: "default", "interruption-level": "time-sensitive" },
          },
        },
      };
    }

    return {
      token: device.token,
      data,
      android: {
        priority: "HIGH",
        // A ring is worthless late. If the phone was off, the teacher has long
        // since given up — better it never arrives than arrives at midnight.
        ttl: "45s",
      },
    };
  });
}

/**
 * Stop a ring already in progress: the teacher hung up, or the student
 * answered on another device. Without this the phone keeps ringing into a
 * call that no longer exists.
 */
export async function sendCallEndedPush(userIds: string[], callId: string): Promise<number> {
  return sendToDevices(userIds, (device) => {
    const data = { type: "CALL_ENDED", callId };

    // On iOS there is no ring to cancel — the call arrived as an ordinary
    // alert — so this is a background push whose only job is to clear the
    // notification if the app happens to be alive. It must stay silent:
    // a second banner saying nothing, seconds after the first, is noise.
    if (isIos(device)) {
      return {
        token: device.token,
        data,
        apns: {
          headers: { "apns-priority": "5", "apns-push-type": "background" },
          payload: { aps: { "content-available": 1 } },
        },
      };
    }

    return {
      token: device.token,
      data,
      android: { priority: "HIGH", ttl: "60s" },
    };
  });
}

/**
 * The class is over — clear the "Join classroom now" card on every phone that
 * is still offering it.
 *
 * Silent on purpose, on both platforms. A student who was never in the class
 * does not need a banner telling them a lesson they missed has finished; the
 * only job here is to take a stale card off a screen. The one that *is*
 * user-visible is the ring at the start of class (`sendCallPush`).
 *
 * Best effort, and knowingly so: iOS throttles background pushes and drops
 * them entirely for an app the user force-quit. The client's adaptive poll is
 * what guarantees the card eventually goes; this is what makes it feel instant
 * when it works.
 */
export async function sendClassEndedPush(userIds: string[], sessionId: string): Promise<number> {
  return sendToDevices(userIds, (device) => {
    const data = { type: "CLASS_ENDED", sessionId };

    if (isIos(device)) {
      return {
        token: device.token,
        data,
        apns: {
          headers: { "apns-priority": "5", "apns-push-type": "background" },
          payload: { aps: { "content-available": 1 } },
        },
      };
    }

    return {
      token: device.token,
      data,
      android: { priority: "HIGH", ttl: "300s" },
    };
  });
}

/** Remove one device (sign-out on that handset). */
export async function removeDeviceToken(userId: string, token: string) {
  await db
    .delete(deviceTokens)
    .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)));
}
