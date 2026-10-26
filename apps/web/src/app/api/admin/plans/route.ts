/**
 * @fileoverview Create a plan.
 *
 * RBAC: ORG_ADMIN and above. The plan belongs to the admin's own org.
 * POST /api/admin/plans — { name, tier, priceInCents, currency, classesPerWeek,
 *                           maxStudents, sessionType, description?, isActive? }
 *
 * Plans here are local rows. Nothing in the app reads `stripePriceId` — the
 * school invoices by hand — so a plan made here has no Stripe price and needs
 * none. Price is what api/admin/invoices fills in when an admin leaves the
 * amount blank; `classesPerWeek` and `tier` are what lib/quota.ts reads.
 *
 * Audit: SETTINGS_CHANGED with op "plan.create" (the enum has no plan action).
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { withDb, withRLS } from "@/lib/db";
import { plans } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, ConflictError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { planSchema } from "./schema";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const data = planSchema.parse(await request.json());

      const plan = await withRLS(ctx, async (tx) => {
        const clash = await tx
          .select({ id: plans.id })
          .from(plans)
          .where(and(eq(plans.orgId, ctx.orgId), sql`lower(${plans.name}) = lower(${data.name})`))
          .limit(1);
        if (clash.length > 0) throw new ConflictError("There's already a plan with that name.");

        const [row] = await tx
          .insert(plans)
          .values({ ...data, orgId: ctx.orgId, description: data.description || null })
          .returning();
        return row;
      });

      await logAudit({
        orgId: plan.orgId,
        actorId: ctx.userId,
        action: "SETTINGS_CHANGED",
        target: `plan:${plan.id}`,
        metadata: { op: "plan.create", ...data },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ plan }, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
