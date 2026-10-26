/**
 * @fileoverview Edit or retire one plan.
 *
 * RBAC: ORG_ADMIN and above; an ORG_ADMIN only reaches their own org's plans.
 * PATCH /api/admin/plans/[id] — any subset of the plan fields.
 *
 * There is no delete: subscriptions and invoices point at plans. Retire one
 * with `isActive: false`; it drops out of the assign form and the family
 * billing page, and families already on it keep it until moved.
 *
 * Two edits are refused:
 * - price or currency on a plan linked to a Stripe price — Stripe charges its
 *   own figure, and the two would disagree;
 * - tier while families are on the plan — tier decides whether each child
 *   has their own weekly allowance (lib/quota.ts isPerChildPlan), and
 *   flipping it mid-period changes what every one of those families can book.
 *
 * A price change applies to the next invoice raised; invoices already raised
 * keep their amount.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { withDb, withRLS } from "@/lib/db";
import { plans, subscriptions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { LIVE_STATUSES } from "@/lib/admin-subscriptions";
import { planPatchSchema } from "../schema";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id } = await params;
      const data = planPatchSchema.parse(await request.json());

      const result = await withRLS(ctx, async (tx) => {
        const [plan] = await tx
          .select()
          .from(plans)
          .where(and(eq(plans.id, id), ctx.role === "SUPER_ADMIN" ? undefined : eq(plans.orgId, ctx.orgId)))
          .for("update");
        if (!plan) throw new NotFoundError("Plan");

        if (plan.stripePriceId) {
          if (
            (data.priceInCents !== undefined && data.priceInCents !== plan.priceInCents) ||
            (data.currency !== undefined && data.currency !== plan.currency)
          ) {
            throw new BusinessRuleError("This plan is linked to a Stripe price. Change its amount in Stripe.");
          }
        }

        if (data.tier !== undefined && data.tier !== plan.tier) {
          const [{ n }] = await tx
            .select({ n: count() })
            .from(subscriptions)
            .where(and(eq(subscriptions.planId, plan.id), inArray(subscriptions.status, [...LIVE_STATUSES])));
          if (n > 0) {
            throw new BusinessRuleError(
              `${n} ${n === 1 ? "family is" : "families are"} on this plan. Move them to another plan before changing its tier.`
            );
          }
        }

        if (data.name !== undefined && data.name.toLowerCase() !== plan.name.toLowerCase()) {
          const clash = await tx
            .select({ id: plans.id })
            .from(plans)
            .where(and(eq(plans.orgId, plan.orgId), ne(plans.id, plan.id), sql`lower(${plans.name}) = lower(${data.name})`))
            .limit(1);
          if (clash.length > 0) throw new ConflictError("There's already a plan with that name.");
        }

        const set = {
          ...data,
          ...(data.description !== undefined ? { description: data.description || null } : {}),
        };
        const [updated] = await tx
          .update(plans)
          .set(set)
          .where(and(eq(plans.id, plan.id), eq(plans.orgId, plan.orgId)))
          .returning();
        return { previous: plan, updated };
      });

      const { previous, updated } = result;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(data) as (keyof typeof data)[]) {
        const from = previous[key as keyof typeof previous];
        const to = updated[key as keyof typeof updated];
        if (from !== to) changes[key] = { from, to };
      }

      if (Object.keys(changes).length > 0) {
        await logAudit({
          orgId: updated.orgId,
          actorId: ctx.userId,
          action: "SETTINGS_CHANGED",
          target: `plan:${updated.id}`,
          metadata: {
            op: data.isActive === false && previous.isActive ? "plan.retire" : "plan.update",
            changes,
          },
          ipAddress: getClientIp(request.headers),
        });
      }

      return NextResponse.json({ plan: updated });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
