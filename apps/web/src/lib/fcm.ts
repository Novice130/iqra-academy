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
 * Push to every device belonging to these users.
 *
 * Never throws: a class starting must not fail because Google is having a bad
 * afternoon. Returns how many devices accepted the message.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  if (userIds.length === 0 || !isPushConfigured()) return 0;

  try {
    const cfg = config()!;
    const accessToken = await getAccessToken();
    if (!accessToken) return 0;

    const devices = await db.query.deviceTokens.findMany({
      where: inArray(deviceTokens.userId, userIds),
      columns: { token: true, userId: true },
    });
    if (devices.length === 0) return 0;

    const url = `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`;
    const dead: string[] = [];
    let sent = 0;

    await Promise.all(
      devices.map(async (device) => {
        const message = {
          message: {
            token: device.token,
            notification: { title: payload.title, body: payload.body },
            // Data travels alongside the notification so the app knows where
            // to go when it is tapped — see PushService._pathOf.
            data: {
              ...(payload.path ? { path: payload.path } : {}),
              ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
            },
            android: {
              priority: "HIGH" as const,
              notification: { channelId: "novice_tutor_default" },
            },
          },
        };

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

/** Remove one device (sign-out on that handset). */
export async function removeDeviceToken(userId: string, token: string) {
  await db
    .delete(deviceTokens)
    .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)));
}
