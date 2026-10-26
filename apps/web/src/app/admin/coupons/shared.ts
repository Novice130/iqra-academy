/**
 * @fileoverview Coupon row shape and derived state, shared by the
 * /admin/coupons server page and its client components.
 */

import { money } from "@/lib/money";

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discountPercent: number | null;
  discountAmountCents: number | null;
  duration: string;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  redemptions: number;
  validUntil: string | null;
  isActive: boolean;
  /** Has a Stripe coupon behind it, so deactivating goes through Stripe. */
  inStripe: boolean;
  applicableTiers: string[];
  createdAt: string;
}

export type CouponState = "ACTIVE" | "INACTIVE" | "EXPIRED" | "USED_UP";

/** Deactivated beats expired beats used up: the most deliberate reason wins. */
export function couponState(c: CouponRow, now: number): CouponState {
  if (!c.isActive) return "INACTIVE";
  if (c.validUntil && Date.parse(c.validUntil) < now) return "EXPIRED";
  if (c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions) return "USED_UP";
  return "ACTIVE";
}

/** "20% off" or "$10.00 off". */
export function discountLabel(c: Pick<CouponRow, "discountPercent" | "discountAmountCents">): string {
  if (c.discountPercent) return `${c.discountPercent}% off`;
  if (c.discountAmountCents) return `${money(c.discountAmountCents, "usd")} off`;
  return "—";
}

/** "Once", "3 months", "Forever". */
export function durationLabel(c: Pick<CouponRow, "duration" | "durationInMonths">): string {
  if (c.duration === "forever") return "Forever";
  if (c.duration === "repeating") {
    const n = c.durationInMonths ?? 1;
    return `${n} month${n === 1 ? "" : "s"}`;
  }
  return "Once";
}
