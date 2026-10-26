/**
 * @fileoverview Admin coupons.
 *
 * RBAC: ORG_ADMIN and above (a SUPER_ADMIN lists every org's).
 * GET  /api/admin/coupons — the org's coupons with redemption counts
 * POST /api/admin/coupons — create one in Stripe, then here
 * PATCH /api/admin/coupons/[id] — deactivate (see [id]/route.ts)
 *
 * A coupon only does anything through Stripe — it is applied by passing its
 * `stripeCouponId` when a subscription is created — so creation needs Stripe
 * configured and refuses up front when it isn't, rather than writing a row
 * that can never discount anything.
 *
 * The coupon's own duration ("once", "repeating" for N months, "forever") is
 * sent to Stripe and stored here. This route used to hardcode one repeating
 * month for every coupon whatever the admin chose.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, withDb } from "@/lib/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { couponRedemptions, coupons } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, AppError, BusinessRuleError, ConflictError } from "@/lib/errors";
import { createStripeCoupon, deleteStripeCoupon, isStripeConfigured } from "@/lib/stripe";
import { logAudit, getClientIp } from "@/lib/audit";
import { zonedWallClockToInstant } from "@/lib/slots";
import { isValidZone } from "@/lib/zones";

const TIERS = ["FREE", "INDIVIDUAL", "GROUP", "SIBLINGS"] as const;

const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(20)
      .regex(/^[A-Z0-9-]+$/, "Letters, digits and dashes only"),
    description: z.string().trim().max(200).optional(),
    discountPercent: z.number().int().min(1).max(100).optional(),
    discountAmountCents: z.number().int().positive().max(10_000_00).optional(),
    duration: z.enum(["once", "repeating", "forever"]).default("once"),
    durationInMonths: z.number().int().min(1).max(36).optional(),
    maxRedemptions: z.number().int().positive().max(100_000).optional(),
    validUntil: z.string().datetime().optional(),
    /** Last day it can be used, as a calendar day in `timeZone`; wins over validUntil. */
    validUntilDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
    timeZone: z.string().max(64).optional(),
    applicableTiers: z.array(z.enum(TIERS)).min(1, "Pick at least one plan"),
  })
  .refine((d) => (d.discountPercent === undefined) !== (d.discountAmountCents === undefined), {
    message: "Give a percentage or an amount off, not both",
    path: ["discountPercent"],
  })
  .refine((d) => d.duration !== "repeating" || d.durationInMonths !== undefined, {
    message: "Say how many months a repeating coupon lasts",
    path: ["durationInMonths"],
  })
  .transform(({ validUntilDay, timeZone, validUntil, ...rest }) => {
    let expires = validUntil ? new Date(validUntil) : null;
    if (validUntilDay) {
      const zone = timeZone && isValidZone(timeZone) ? timeZone : "UTC";
      const [y, m, d] = validUntilDay.split("-").map(Number);
      // The last minute of that day, so "until 31 December" includes it.
      expires = zonedWallClockToInstant(y, m, d, 23, 59, zone);
    }
    return { ...rest, validUntil: expires };
  })
  .refine((d) => !d.validUntil || d.validUntil > new Date(), {
    message: "The expiry date has already passed",
    path: ["validUntilDay"],
  });

/** GET /api/admin/coupons — list org coupons, newest first. */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const rows = await db
        .select({
          coupon: coupons,
          redemptions: sql<number>`(select count(*)::int from ${couponRedemptions} where ${couponRedemptions.couponId} = ${coupons.id})`,
        })
        .from(coupons)
        .where(ctx.role === "SUPER_ADMIN" ? undefined : eq(coupons.orgId, ctx.orgId))
        .orderBy(desc(coupons.createdAt));

      return NextResponse.json({
        coupons: rows.map((r) => ({ ...r.coupon, redemptionCount: r.redemptions })),
        stripeConfigured: isStripeConfigured(),
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/** POST /api/admin/coupons — create coupon (Stripe first, then local). */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = createCouponSchema.parse(await request.json());

      if (!isStripeConfigured()) {
        throw new BusinessRuleError("Stripe isn't configured on this server, so coupons can't be created.");
      }

      // Checked before Stripe so a duplicate code doesn't leave an orphan
      // coupon in the Stripe account. The unique index still has the last word.
      const clash = await db.query.coupons.findFirst({
        where: and(eq(coupons.orgId, ctx.orgId), eq(coupons.code, data.code)),
        columns: { id: true },
      });
      if (clash) throw new ConflictError(`There's already a coupon with the code ${data.code}.`);

      const months = data.duration === "repeating" ? data.durationInMonths : undefined;

      let stripeCouponId: string;
      try {
        const stripeCoupon = await createStripeCoupon({
          // Stripe caps a coupon name at 40 characters.
          name: `${data.code} — ${data.description || "Discount"}`.slice(0, 40),
          percentOff: data.discountPercent,
          amountOffCents: data.discountAmountCents,
          duration: data.duration,
          durationInMonths: months,
          maxRedemptions: data.maxRedemptions,
        });
        stripeCouponId = stripeCoupon.id;
      } catch (err) {
        const detail = err instanceof Error ? err.message : "no response";
        throw new AppError(`Stripe didn't create the coupon (${detail}). Nothing was saved.`, 502, "STRIPE_ERROR");
      }

      let coupon: typeof coupons.$inferSelect;
      try {
        [coupon] = await db
          .insert(coupons)
          .values({
            orgId: ctx.orgId,
            code: data.code,
            description: data.description || null,
            discountPercent: data.discountPercent ?? null,
            discountAmountCents: data.discountAmountCents ?? null,
            duration: data.duration,
            durationInMonths: months ?? null,
            maxRedemptions: data.maxRedemptions ?? null,
            validUntil: data.validUntil,
            applicableTiers: data.applicableTiers,
            stripeCouponId,
          })
          .returning();
      } catch (err) {
        // Don't leave a live Stripe coupon that nothing here knows about.
        await deleteStripeCoupon(stripeCouponId).catch((e) =>
          console.error("[COUPONS] Could not remove orphan Stripe coupon", stripeCouponId, e)
        );
        throw err;
      }

      await logAudit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "COUPON_CREATED",
        target: `coupon:${coupon.id}`,
        metadata: {
          code: coupon.code,
          stripeCouponId,
          discountPercent: coupon.discountPercent,
          discountAmountCents: coupon.discountAmountCents,
          duration: coupon.duration,
          durationInMonths: coupon.durationInMonths,
        },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ coupon: { ...coupon, redemptionCount: 0 } }, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
