/**
 * @fileoverview Stripe Webhook Handler
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * This is arguably the MOST CRITICAL endpoint in the entire application.
 * Stripe sends webhooks here whenever something payment-related happens.
 *
 * SECURITY RULES:
 * 1. ALWAYS verify the webhook signature (prevents fake events)
 * 2. NEVER trust data in the webhook body without verification
 * 3. Handle events IDEMPOTENTLY (Stripe may send the same event twice!)
 * 4. Return 200 quickly (Stripe retries if it doesn't get 200 in 20s)
 *
 * @module api/webhooks/stripe
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { subscriptions } from "@/db/schema";
import { verifyWebhookSignature } from "@/lib/stripe";
import { logAudit } from "@/lib/audit";
import { sendPaymentReceipt } from "@/lib/email";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

/** Extract the Stripe subscription ID from an invoice webhook payload. */
function extractSubscriptionId(invoice: Record<string, unknown>): string | null {
  const parent = invoice.parent as Record<string, unknown> | null;
  if (parent?.subscription_details) {
    const details = parent.subscription_details as Record<string, unknown>;
    if (typeof details.subscription === "string") return details.subscription;
  }
  const sub = invoice.subscription;
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object" && "id" in sub) return (sub as { id: string }).id;
  return null;
}

export async function POST(request: NextRequest) {
  let event: Stripe.Event;

  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
    }

    event = verifyWebhookSignature(body, signature);
  } catch (error) {
    console.error("[STRIPE WEBHOOK] Signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as unknown as Record<string, unknown>);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as unknown as Record<string, unknown>);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as unknown as Record<string, unknown>);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as unknown as Record<string, unknown>);
        break;

      default:
        console.log(`[STRIPE WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[STRIPE WEBHOOK] Error handling ${event.type}:`, error);
    return NextResponse.json({ received: true, error: "Processing failed" });
  }
}

/** Handles invoice.paid — the student has paid their invoice. */
async function handleInvoicePaid(invoice: Record<string, unknown>) {
  const subId = extractSubscriptionId(invoice);
  if (!subId) return;

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, subId),
    with: { user: true },
  });

  if (!subscription) {
    console.warn(`[STRIPE] No local subscription for Stripe ID: ${subId}`);
    return;
  }

  const periodStart = typeof invoice.period_start === "number"
    ? new Date(invoice.period_start * 1000) : undefined;
  const periodEnd = typeof invoice.period_end === "number"
    ? new Date(invoice.period_end * 1000) : undefined;

  await db
    .update(subscriptions)
    .set({
      status: "ACTIVE",
      ...(periodStart && { currentPeriodStart: periodStart }),
      ...(periodEnd && { currentPeriodEnd: periodEnd }),
    })
    .where(eq(subscriptions.id, subscription.id));

  // Send payment receipt email
  const amountPaid = typeof invoice.amount_paid === "number" ? invoice.amount_paid : 0;
  const amount = `$${(amountPaid / 100).toFixed(2)}`;
  const hostedUrl = typeof invoice.hosted_invoice_url === "string"
    ? invoice.hosted_invoice_url : "";

  await sendPaymentReceipt(
    subscription.user.email,
    subscription.user.name,
    amount,
    "Quran Learning Plan",
    hostedUrl
  );

  await logAudit({
    orgId: subscription.orgId,
    action: "PAYMENT_RECEIVED",
    target: `subscription:${subscription.id}`,
    metadata: { stripeInvoiceId: String(invoice.id), amount: amountPaid },
  });
}

/** Handles invoice.payment_failed — student's payment didn't go through. */
async function handlePaymentFailed(invoice: Record<string, unknown>) {
  const subId = extractSubscriptionId(invoice);
  if (!subId) return;

  await db
    .update(subscriptions)
    .set({ status: "PAST_DUE" })
    .where(eq(subscriptions.stripeSubscriptionId, subId));
}

/** Handles customer.subscription.updated — plan changes, status changes, etc. */
async function handleSubscriptionUpdated(sub: Record<string, unknown>) {
  const statusMap: Record<string, "ACTIVE" | "PAST_DUE" | "CANCELLED" | "UNPAID" | "PAUSED"> = {
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELLED",
    unpaid: "UNPAID",
    paused: "PAUSED",
  };

  const stripeStatus = typeof sub.status === "string" ? sub.status : "active";
  const subId = typeof sub.id === "string" ? sub.id : "";

  const periodStart = typeof sub.current_period_start === "number"
    ? new Date(sub.current_period_start * 1000) : undefined;
  const periodEnd = typeof sub.current_period_end === "number"
    ? new Date(sub.current_period_end * 1000) : undefined;

  await db
    .update(subscriptions)
    .set({
      status: statusMap[stripeStatus] || "ACTIVE",
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
      ...(periodStart && { currentPeriodStart: periodStart }),
      ...(periodEnd && { currentPeriodEnd: periodEnd }),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subId));
}

/** Handles customer.subscription.deleted — subscription fully cancelled. */
async function handleSubscriptionDeleted(sub: Record<string, unknown>) {
  const subId = typeof sub.id === "string" ? sub.id : "";

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, subId),
  });

  if (subscription) {
    await db
      .update(subscriptions)
      .set({ status: "CANCELLED" })
      .where(eq(subscriptions.id, subscription.id));

    await logAudit({
      orgId: subscription.orgId,
      action: "SUBSCRIPTION_CANCELLED",
      target: `subscription:${subscription.id}`,
      metadata: { stripeSubscriptionId: subId },
    });
  }
}
