/**
 * @fileoverview Cal.com Integration Types & Webhook Helpers
 * @module lib/calcom
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Cal.com webhook event types */
export type CalcomWebhookEvent =
  | "BOOKING_CREATED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_REJECTED"
  | "BOOKING_COMPLETED";

/** Cal.com webhook payload (simplified — we type only fields we use) */
export interface CalcomWebhookPayload {
  triggerEvent: CalcomWebhookEvent;
  createdAt: string;
  payload: {
    id: number;
    eventTypeId: number;
    title: string;
    startTime: string;
    endTime: string;
    attendees: Array<{ email: string; name: string; timeZone: string }>;
    organizer: { email: string; name: string; timeZone: string };
    metadata: { orgId?: string; userId?: string; sessionType?: string };
    status: string;
    cancellationReason?: string;
  };
}

/**
 * Verifies a Cal.com webhook signature using HMAC-SHA256.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifyCalcomWebhook(body: string, signature: string): boolean {
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[CALCOM] CALCOM_WEBHOOK_SECRET not configured");
    return false;
  }

  const computed = createHmac("sha256", secret).update(body).digest("hex");
  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Maps Cal.com event type IDs to our SessionType enum */
export function mapCalcomEventType(
  eventTypeId: number
): "INDIVIDUAL" | "GROUP" | "WEBINAR" | null {
  const mapping: Record<number, "INDIVIDUAL" | "GROUP" | "WEBINAR"> = {
    1: "INDIVIDUAL",
    2: "GROUP",
    3: "WEBINAR",
  };
  return mapping[eventTypeId] || null;
}
