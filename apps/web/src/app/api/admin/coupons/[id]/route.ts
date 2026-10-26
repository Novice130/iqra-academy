/**
 * @fileoverview Deactivate one coupon.
 *
 * RBAC: ORG_ADMIN and above; an ORG_ADMIN only reaches their own org's.
 * PATCH /api/admin/coupons/[id] — { active: false }
 *
 * Order matters. Stripe is what actually applies a coupon, so it is retired
 * there first; the local row is only marked inactive once Stripe has agreed.
 * If Stripe can't be reached the request fails and nothing changes — a row
 * marked inactive here while the Stripe coupon still works would tell the
 * admin a code is dead when families can still use it.
 *
 * There is no reactivate: Stripe deletes a coupon rather than pausing it, so
 * bringing one back means creating a new one.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, withDb } from "@/lib/db";
import { coupons } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, AppError, BusinessRuleError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { deleteStripeCoupon, isStripeConfigured } from "@/lib/stripe";

const patchSchema = z.object({ active: z.literal(false) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { id } = await params;
      patchSchema.parse(await request.json());

      const coupon = await db.query.coupons.findFirst({
        where: and(
          eq(coupons.id, id),
          ctx.role === "SUPER_ADMIN" ? undefined : eq(coupons.orgId, ctx.orgId)
        ),
      });
      if (!coupon) throw new NotFoundError("Coupon");
      if (!coupon.isActive) return NextResponse.json({ coupon });

      if (coupon.stripeCouponId) {
        if (!isStripeConfigured()) {
          throw new BusinessRuleError(
            "Stripe isn't configured on this server, so the Stripe coupon can't be retired. Nothing was changed."
          );
        }
        try {
          await deleteStripeCoupon(coupon.stripeCouponId);
        } catch (err) {
          const detail = err instanceof Error ? err.message : "no response";
          throw new AppError(`Stripe didn't retire the coupon (${detail}). Nothing was changed.`, 502, "STRIPE_ERROR");
        }
      }

      const [updated] = await db
        .update(coupons)
        .set({ isActive: false })
        .where(and(eq(coupons.id, coupon.id), eq(coupons.orgId, coupon.orgId)))
        .returning();

      await logAudit({
        orgId: coupon.orgId,
        actorId: ctx.userId,
        action: "SETTINGS_CHANGED",
        target: `coupon:${coupon.id}`,
        metadata: { op: "coupon.deactivate", code: coupon.code, stripeCouponId: coupon.stripeCouponId },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ coupon: updated });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
