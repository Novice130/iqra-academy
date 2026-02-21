/**
 * @fileoverview Admin Coupons API
 *
 * RBAC: ORG_ADMIN role
 * GET  /api/admin/coupons — List coupons for the org
 * POST /api/admin/coupons — Create a new coupon (syncs to Stripe)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { coupons } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { createStripeCoupon } from "@/lib/stripe";
import { logAudit, getClientIp } from "@/lib/audit";

const createCouponSchema = z.object({
  code: z.string().min(3).max(20).regex(/^[A-Z0-9-]+$/, "Code must be uppercase alphanumeric"),
  description: z.string().max(200).optional(),
  discountPercent: z.number().int().min(1).max(100).optional(),
  discountAmountCents: z.number().int().positive().optional(),
  maxRedemptions: z.number().int().positive().optional(),
  validUntil: z.string().datetime().optional(),
  applicableTiers: z.array(z.enum(["FREE", "INDIVIDUAL", "GROUP", "SIBLINGS"])).min(1),
});

/** GET /api/admin/coupons — list org coupons */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const result = await db.query.coupons.findMany({
      where: eq(coupons.orgId, ctx.orgId),
      with: { redemptions: true },
      orderBy: desc(coupons.createdAt),
    });

    return NextResponse.json({ coupons: result });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/admin/coupons — create coupon (local + Stripe) */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const data = createCouponSchema.parse(body);

    // Create Stripe coupon
    const stripeCoupon = await createStripeCoupon({
      name: `${data.code} — ${data.description || "Discount"}`,
      percentOff: data.discountPercent,
      amountOffCents: data.discountAmountCents,
      duration: "repeating",
      durationInMonths: 1,
      maxRedemptions: data.maxRedemptions,
    });

    // Create local coupon linked to Stripe
    const [coupon] = await db.insert(coupons).values({
      orgId: ctx.orgId,
      code: data.code,
      description: data.description,
      discountPercent: data.discountPercent,
      discountAmountCents: data.discountAmountCents,
      maxRedemptions: data.maxRedemptions,
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      applicableTiers: data.applicableTiers,
      stripeCouponId: stripeCoupon.id,
    }).returning();

    await logAudit({
      orgId: ctx.orgId, actorId: ctx.userId,
      action: "COUPON_CREATED", target: `coupon:${coupon.id}`,
      metadata: { code: data.code, stripeCouponId: stripeCoupon.id },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
