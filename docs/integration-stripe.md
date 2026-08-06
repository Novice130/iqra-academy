# Stripe Integration Guide

## Overview
The Quran LMS uses Stripe for subscription management with **manual invoice** as the default payment method.

## Setup Steps

### 1. Create Stripe Account
1. Go to [stripe.com](https://stripe.com) and create an account
2. Get your API keys from Dashboard → Developers → API Keys
3. Copy `sk_test_...` to `STRIPE_SECRET_KEY` in `.env`
4. Copy `pk_test_...` to `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### 2. Create Products and Prices
In Stripe Dashboard → Products, create:

| Product | Price | Interval | Notes |
|---------|-------|----------|-------|
| 1:1 Quran Lessons | $70.00/mo | Monthly | `collection_method: send_invoice` |
| Group Quran Lessons | $50.00/mo | Monthly | `collection_method: send_invoice` |
| Siblings Plan | $100.00/mo | Monthly | Up to 3 children |
| Free Webinar | $0.00 | N/A | No Stripe product needed |

Save each Price ID (e.g., `price_xxx`) and add to your Plan records in the database.

### 3. Configure Webhooks
1. Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://yourapp.com/api/webhooks/stripe`
3. Events to listen for:
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the Signing Secret to `STRIPE_WEBHOOK_SECRET` in `.env`

### 4. Manual Invoice Flow
```
Student signs up
  → createStripeCustomer() creates Stripe Customer
  → createManualInvoiceSubscription() creates Subscription
    with collection_method: 'send_invoice', days_until_due: 7
  → Stripe emails invoice to student
  → Student pays via hosted invoice page
  → Stripe sends invoice.paid webhook
  → Our handler activates the subscription + entitlements
```

### 5. Coupon System
Coupons are synced between our DB and Stripe:
1. Admin creates coupon via `/api/admin/coupons`
2. We call `createStripeCoupon()` to create it in Stripe
3. When a student subscribes with a coupon code, we pass the `stripeCouponId`
4. Stripe applies the discount on the invoice
