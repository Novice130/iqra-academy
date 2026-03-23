/**
 * @fileoverview Admin Refunds API
 *
 * RBAC: ORG_ADMIN role
 * POST /api/admin/refunds — Issue a refund via Stripe
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { issueRefund } from "@/lib/stripe";
import { logAudit, getClientIp } from "@/lib/audit";

const refundSchema = z.object({
  paymentIntentId: z.string().min(1),
  amountCents: z.number().int().positive().nullable(),
  reason: z.string().min(1).max(500),
});

/** POST /api/admin/refunds — process a Stripe refund */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const data = refundSchema.parse(body);

    const refund = await issueRefund(
      data.paymentIntentId,
      data.amountCents,
      data.reason
    );

    await logAudit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "REFUND_ISSUED",
      target: `payment:${data.paymentIntentId}`,
      metadata: {
        refundId: refund.id,
        amountCents: data.amountCents,
        reason: data.reason,
      },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({
      success: true,
      refund: { id: refund.id, amount: refund.amount, status: refund.status },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
