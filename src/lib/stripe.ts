/**
 * @fileoverview Stripe Payment Integration
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * Stripe is our payment processor. We use it for:
 * 1. Subscriptions — recurring monthly payments ($70/mo, $50/mo, etc.)
 * 2. Manual Invoices — Stripe sends an invoice email, student pays on their schedule
 * 3. Coupons — percentage or fixed-amount discounts
 *
 * THE MANUAL INVOICE FLOW (our default):
 * 1. Student signs up → we create a Stripe Customer
 * 2. We create a Subscription with `collection_method: 'send_invoice'`
 * 3. Stripe generates an invoice and emails it to the student
 * 4. The invoice has a "Pay Now" link that Stripe hosts
 * 5. Student pays → Stripe sends `invoice.paid` webhook → we update entitlements
 *
 * WHY MANUAL INVOICE? Many Islamic school families prefer to:
 * - Pay at their own pace (not auto-charged)
 * - Use Zelle/bank transfer (Stripe invoices support ACH)
 * - Have their spouse/family handle payment
 *
 * SECURITY: The Stripe secret key must NEVER be exposed to the client.
 * All Stripe operations happen server-side in API routes.
 *
 * @module lib/stripe
 */

import Stripe from "stripe";

/**
 * Stripe server-side client instance.
 *
 * WHY 2025-LATEST API VERSION?
 * Stripe regularly updates their API. Pinning to a version ensures
 * our code doesn't break when Stripe makes changes. We can upgrade
 * on our schedule.
 *
 * FAILURE MODES:
 * - Missing STRIPE_SECRET_KEY → throws on any API call
 * - Invalid key → Stripe returns 401
 * - Rate limiting → Stripe returns 429 (auto-retry built into SDK)
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
});

// ============================================================================
// PRICING CONSTANTS
// ============================================================================

/**
 * Pricing tiers as defined in the product requirements.
 * These amounts are in CENTS (Stripe's convention).
 *
 * 📚 WHY CENTS? Floating point math is unreliable for money.
 * `0.1 + 0.2 !== 0.3` in JavaScript. By using integers (cents),
 * we avoid rounding errors. $70.00 = 7000 cents.
 */
export const PRICING = {
  FREE: { amountCents: 0, classesPerWeek: 0, maxStudents: 20 },
  INDIVIDUAL: { amountCents: 7000, classesPerWeek: 4, maxStudents: 1 },
  GROUP: { amountCents: 5000, classesPerWeek: 4, maxStudents: 3 },
  SIBLINGS: { amountCents: 10000, classesPerWeek: 4, maxStudents: 3 },
} as const;

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

/**
 * Creates a Stripe customer for a new user.
 *
 * 📚 BUSINESS RULE: One Stripe customer per User (not per StudentProfile).
 * The parent is the billing entity — their children don't have payment info.
 *
 * We store the Stripe customer ID in our Subscription model so we can
 * look up the customer without querying Stripe every time.
 *
 * @param email - User's email address
 * @param name - User's full name
 * @param orgId - Organization ID (stored as metadata for Stripe Dashboard filtering)
 * @returns The created Stripe Customer object
 *
 * FAILURE MODES:
 * - Duplicate email: Stripe allows it (unlike some services), but we should
 *   check for existing customers first in production
 * - Invalid email format: Stripe returns 400
 */
export async function createStripeCustomer(
  email: string,
  name: string,
  orgId: string
): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email,
    name,
    metadata: {
      orgId,
      source: "quran-lms",
    },
  });
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Creates a subscription with manual invoice as the default payment method.
 *
 * 📚 THE collection_method EXPLAINED:
 * - `charge_automatically` — Stripe charges the card on file immediately
 * - `send_invoice` — Stripe generates an invoice and emails it
 *
 * We default to `send_invoice` because our users (Muslim families) often:
 * 1. Want to review the invoice before paying
 * 2. Prefer bank transfers over card charges
 * 3. Have a spouse who handles household payments
 *
 * The `days_until_due: 7` gives them a week to pay. After that, Stripe
 * sends reminder emails automatically.
 *
 * @param customerId - Stripe Customer ID
 * @param priceId - Stripe Price ID (created in Stripe Dashboard or via API)
 * @param couponId - Optional Stripe coupon ID for discounts
 * @returns The created Stripe Subscription
 *
 * FAILURE MODES:
 * - Invalid customerId → Stripe 404
 * - Invalid priceId → Stripe 404
 * - Customer already has this subscription → creates a duplicate (we prevent in app logic)
 */
export async function createManualInvoiceSubscription(
  customerId: string,
  priceId: string,
  couponId?: string
): Promise<Stripe.Subscription> {
  const subscriptionData: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId }],
    collection_method: "send_invoice",
    days_until_due: 7,
  };

  // Apply coupon if provided (Stripe SDK v17+ uses `discounts` instead of `coupon`)
  if (couponId) {
    subscriptionData.discounts = [{ coupon: couponId }];
  }

  return stripe.subscriptions.create(subscriptionData);
}

/**
 * Creates a subscription with automatic card charging.
 * Used when a student explicitly opts in to auto-pay.
 *
 * @param customerId - Stripe Customer ID
 * @param priceId - Stripe Price ID
 * @param paymentMethodId - Stripe Payment Method ID (from Stripe Elements)
 * @returns The created Stripe Subscription
 */
export async function createAutoChargeSubscription(
  customerId: string,
  priceId: string,
  paymentMethodId: string
): Promise<Stripe.Subscription> {
  // First, attach the payment method to the customer
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });

  // Set it as the default payment method
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    collection_method: "charge_automatically",
    default_payment_method: paymentMethodId,
  });
}

// ============================================================================
// REFUNDS
// ============================================================================

/**
 * Issues a refund for a specific payment.
 *
 * 📚 REFUND RULES (BUSINESS LOGIC):
 * - Only ORG_ADMIN can issue refunds
 * - Partial refunds are supported (e.g., refund 1 unused week)
 * - Full refunds cancel the subscription automatically
 * - All refunds are logged in the audit trail
 *
 * @param paymentIntentId - The Stripe Payment Intent to refund
 * @param amountCents - Amount to refund in cents (null = full refund)
 * @param reason - Required reason for audit trail
 * @returns The Stripe Refund object
 *
 * FAILURE MODES:
 * - Payment already refunded → Stripe 400
 * - Amount exceeds original charge → Stripe 400
 * - Refund after 180 days → may fail (Stripe policy)
 */
export async function issueRefund(
  paymentIntentId: string,
  amountCents: number | null,
  reason: string
): Promise<Stripe.Refund> {
  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    metadata: { reason },
  };

  if (amountCents !== null) {
    refundParams.amount = amountCents;
  }

  return stripe.refunds.create(refundParams);
}

// ============================================================================
// COUPON MANAGEMENT
// ============================================================================

/**
 * Creates a coupon in Stripe.
 *
 * 📚 COUPON SYNC PATTERN:
 * We create the coupon in BOTH our database and Stripe:
 * - Our DB: for querying, org-scoping, and usage tracking
 * - Stripe: for actually applying the discount on invoices
 *
 * The Stripe coupon ID is stored in our Coupon model as `stripeCouponId`.
 *
 * @param params - Coupon creation parameters
 * @returns The created Stripe Coupon
 */
export async function createStripeCoupon(params: {
  percentOff?: number;
  amountOffCents?: number;
  duration: "once" | "repeating" | "forever";
  durationInMonths?: number;
  maxRedemptions?: number;
  name: string;
}): Promise<Stripe.Coupon> {
  const couponData: Stripe.CouponCreateParams = {
    name: params.name,
    duration: params.duration,
  };

  if (params.percentOff) {
    couponData.percent_off = params.percentOff;
  } else if (params.amountOffCents) {
    couponData.amount_off = params.amountOffCents;
    couponData.currency = "usd";
  }

  if (params.duration === "repeating" && params.durationInMonths) {
    couponData.duration_in_months = params.durationInMonths;
  }

  if (params.maxRedemptions) {
    couponData.max_redemptions = params.maxRedemptions;
  }

  return stripe.coupons.create(couponData);
}

// ============================================================================
// WEBHOOK VERIFICATION
// ============================================================================

/**
 * Verifies a Stripe webhook signature.
 *
 * 📚 WHY VERIFY WEBHOOKS?
 * Without verification, anyone could send fake webhook events to our endpoint.
 * Imagine someone sending a fake `invoice.paid` event — they'd get free access!
 *
 * HOW IT WORKS:
 * 1. Stripe includes a `stripe-signature` header with each webhook
 * 2. We use our webhook signing secret to verify the signature
 * 3. If the signature doesn't match, we reject the request
 *
 * CRITICAL: The webhook signing secret (STRIPE_WEBHOOK_SECRET) is different
 * from the API secret key. You get it from the Stripe Dashboard > Webhooks.
 *
 * @param body - Raw request body (must be the raw string, not parsed JSON)
 * @param signature - The stripe-signature header value
 * @returns The verified Stripe Event
 * @throws Stripe.errors.StripeSignatureVerificationError if invalid
 */
export function verifyWebhookSignature(
  body: string,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}
