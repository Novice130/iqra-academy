/**
 * @fileoverview Put a family on a plan.
 *
 * RBAC: ORG_ADMIN and above. An ORG_ADMIN acts on their own org; a
 * SUPER_ADMIN may act on any org's family, and the row keeps the family's org.
 * POST /api/admin/subscriptions — { userId, planId, startDay, months, timeZone }
 *
 * Writes a manual subscription: ACTIVE, MANUAL_INVOICE, no Stripe ids. This
 * school bills by hand (api/admin/invoices), so nothing here talks to Stripe.
 * The period runs from the start of `startDay` in the admin's zone for
 * `months` calendar months.
 *
 * One live subscription per family — see lib/admin-subscriptions.ts for why.
 * The family row is locked for the check so two quick clicks cannot both
 * pass it.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { withDb, withRLS } from "@/lib/db";
import { plans, subscriptions, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { isValidZone } from "@/lib/zones";
import { LIVE_STATUSES, dayStartInZone, settleLapsedCancellations } from "@/lib/admin-subscriptions";
import { addMonthsToDayKey } from "@/app/admin/plans/shared";

const createSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  months: z.number().int().min(1).max(12).default(1),
  timeZone: z.string().max(64).optional(),
});

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const data = createSchema.parse(await request.json());
      const zone = data.timeZone && isValidZone(data.timeZone) ? data.timeZone : "UTC";

      const periodStart = dayStartInZone(data.startDay, zone);
      const periodEnd = dayStartInZone(addMonthsToDayKey(data.startDay, data.months), zone);
      if (Number.isNaN(periodStart.getTime())) throw new BusinessRuleError("That start date isn't a real day.");
      if (periodEnd <= new Date()) {
        throw new BusinessRuleError("That period is already over. Pick a later start date.");
      }

      const scope = ctx.role === "SUPER_ADMIN" ? undefined : eq(users.orgId, ctx.orgId);

      const result = await withRLS(ctx, async (tx) => {
        const [family] = await tx
          .select({ id: users.id, orgId: users.orgId, role: users.role, name: users.name })
          .from(users)
          .where(and(eq(users.id, data.userId), scope, isNull(users.deletedAt)))
          .for("update");
        if (!family) throw new NotFoundError("Family");
        if (family.role !== "STUDENT") {
          throw new BusinessRuleError("Plans go on family (student) accounts, not staff accounts.");
        }

        const plan = await tx.query.plans.findFirst({
          where: and(eq(plans.id, data.planId), eq(plans.orgId, family.orgId)),
          columns: { id: true, name: true, isActive: true },
        });
        if (!plan) throw new NotFoundError("Plan");
        if (!plan.isActive) throw new BusinessRuleError(`"${plan.name}" is retired. Reactivate it or pick another plan.`);

        // A cancel-at-period-end that has already lapsed is not "live" any
        // more; settle it first so it doesn't block the new plan.
        await settleLapsedCancellations(tx, family.orgId);

        const existing = await tx
          .select({ id: subscriptions.id, status: subscriptions.status })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.userId, family.id),
              eq(subscriptions.orgId, family.orgId),
              inArray(subscriptions.status, [...LIVE_STATUSES])
            )
          )
          .limit(1);
        if (existing.length > 0) {
          throw new ConflictError(
            "This family already has a plan. Change the plan on it, or cancel it first."
          );
        }

        const [sub] = await tx
          .insert(subscriptions)
          .values({
            orgId: family.orgId,
            userId: family.id,
            planId: plan.id,
            status: "ACTIVE",
            paymentMethod: "MANUAL_INVOICE",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          })
          .returning();
        return { sub, planName: plan.name };
      });

      await logAudit({
        orgId: result.sub.orgId,
        actorId: ctx.userId,
        action: "SUBSCRIPTION_CREATED",
        target: `subscription:${result.sub.id}`,
        metadata: {
          op: "subscription.assign",
          userId: result.sub.userId,
          planId: result.sub.planId,
          planName: result.planName,
          periodStart: result.sub.currentPeriodStart.toISOString(),
          periodEnd: result.sub.currentPeriodEnd.toISOString(),
        },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ subscription: result.sub }, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
