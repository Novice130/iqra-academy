/**
 * @fileoverview Web Push Notification System (VAPID)
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * Web Push lets us send notifications to users even when they're not on our site.
 * The main use case: Teacher clicks "Call Now" → student's browser shows a notification.
 *
 * HOW WEB PUSH WORKS (simplified):
 * 1. User grants permission → browser gives us a "push subscription" (an endpoint URL)
 * 2. We store this subscription in our database
 * 3. When we need to notify → we send a request to the push service (Firebase, Apple, etc.)
 * 4. The push service delivers the notification to the user's browser
 * 5. Our service worker (running in background) displays the notification
 *
 * VAPID KEYS:
 * VAPID = Voluntary Application Server Identification
 * It's a key pair that identifies our server to push services.
 * - Public key: shared with the browser (used in the push subscription request)
 * - Private key: kept on our server (used to sign push messages)
 *
 * SECURITY: Push subscriptions are per-device, per-browser. A user on Chrome
 * and Firefox gets two subscriptions. We store all of them.
 *
 * @module lib/push
 */

import webPush from "web-push";

/**
 * Configure web-push with our VAPID keys.
 *
 * 📚 GENERATING VAPID KEYS:
 * Run: `npx web-push generate-vapid-keys`
 * This gives you a public + private key pair. Store them in .env:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=BABC...
 *   VAPID_PRIVATE_KEY=xyz...
 *   VAPID_SUBJECT=mailto:admin@yourschool.com
 *
 * The "subject" is a contact email for push service operators to reach you.
 */
if (process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@quran-lms.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
    process.env.VAPID_PRIVATE_KEY || ""
  );
}

/**
 * The shape of a push subscription as stored in our database.
 * This maps directly to the pushSubscriptions table in the Drizzle schema.
 */
export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends a push notification to a specific subscription.
 *
 * 📚 NOTIFICATION PAYLOAD:
 * The payload is a JSON string that our service worker will parse.
 * It contains the notification title, body, icon, and an action URL.
 * The service worker handles displaying this to the user.
 *
 * @param subscription - The push subscription to send to
 * @param payload - Notification data
 *
 * FAILURE MODES:
 * - Subscription expired → push service returns 410 → delete from DB
 * - Subscription invalid → push service returns 404 → delete from DB
 * - Push service down → returns 503 → retry later
 * - User blocked notifications → subscription stops working (no error from our side)
 */
export async function sendPushNotification(
  subscription: StoredPushSubscription,
  payload: {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    tag?: string;
  }
): Promise<boolean> {
  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;

    // 410 Gone or 404 Not Found — subscription is no longer valid
    if (statusCode === 410 || statusCode === 404) {
      console.warn(
        "[PUSH] Subscription expired/invalid, should remove:",
        subscription.endpoint
      );
      return false;
    }

    console.error("[PUSH] Failed to send notification:", error);
    return false;
  }
}

/**
 * Sends a "Call Now" push notification to a student.
 *
 * 📚 THE "CALL NOW" FLOW:
 * 1. Teacher clicks "Call Now" for a student
 * 2. We look up the student's push subscriptions
 * 3. We send a push notification to ALL their devices
 * 4. Student clicks the notification → opens the Jitsi room
 *
 * WHY ALL DEVICES? The student might be on their phone but the push
 * subscription could be on their laptop. We blast all subscriptions
 * and let the student respond on whichever device they see first.
 *
 * @param subscriptions - All push subscriptions for the student
 * @param teacherName - Teacher's name (shown in notification)
 * @param sessionTitle - Session title
 * @param joinUrl - URL to join the Jitsi room
 * @returns Number of successful deliveries
 */
export async function sendCallNowNotification(
  subscriptions: StoredPushSubscription[],
  teacherName: string,
  sessionTitle: string,
  joinUrl: string
): Promise<number> {
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendPushNotification(sub, {
        title: `📞 ${teacherName} is calling!`,
        body: `Your Quran class "${sessionTitle}" is ready. Tap to join.`,
        icon: "/icons/call-now.png",
        url: joinUrl,
        tag: "call-now", // Replaces previous "call-now" notifications
      })
    )
  );

  return results.filter(
    (r) => r.status === "fulfilled" && r.value === true
  ).length;
}
