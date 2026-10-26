/**
 * @fileoverview Change one manual subscription.
 *
 * RBAC: ORG_ADMIN and above; an ORG_ADMIN only reaches their own org's rows.
 * PATCH /api/admin/subscriptions/[id] — one of
 *   { op: "pause" }                       live → PAUSED (no bookings while paused)
 *   { op: "resume" }                      PAUSED → ACTIVE
 *   { op: "change_plan", planId }         same org, active plan
 *   { op: "extend", untilDay, timeZone }  move the period end later
 *   { op: "cancel", when: "now" | "period_end" }
 *   { op: "keep" }                        undo a scheduled cancel
 *
 * A row with `stripeSubscriptionId` is refused: Stripe owns it and the
 * webhook would overwrite anything written here. Those are managed in Stripe.
 *
 * Pausing does not stop the clock — there is no column for when a pause began
 * — so an admin who wants the paused weeks back extends the period on resume.
 *
 * Audit: cancel → SUBSCRIPTION_CANCELLED; everything else → SETTINGS_CHANGED
 * with `op` = "subscription.<op>". The row is locked for the change so two
 * admins acting at once see each other's result rather than overwrite it.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withDb, withRLS } from "@/lib/db";
import { plans, subscriptions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, BusinessRuleError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { isValidZone } from "@/lib/zones";
import { LIVE_STATUSES, dayStartInZone } from "@/lib/admin-subscriptions";

const patchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("pause") }),
  z.object({ op: z.literal("resume") }),
  z.object({ op: z.literal("keep") }),
  z.object({ op: z.literal("change_plan"), planId: z.string().min(1) }),
  z.object({
    op: z.literal("extend"),
    untilDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    timeZone: z.string().max(64).optional(),
  }),
  z.object({ op: z.literal("cancel"), when: z.enum(["now", "period_end"]) }),
]);

const isLive = (status: string) => (LIVE_STATUSES as readonly string[]).includes(status);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id } = await params;
      const data = patchSchema.parse(await request.json());

      const result = await withRLS(ctx, async (tx) => {
        const [sub] = await tx
          .select()
          .from(subscriptions)
          .where(and(eq(subscriptions.id, id), ctx.role === "SUPER_ADMIN" ? undefined : eq(subscriptions.orgId, ctx.orgId)))
          .for("update");
        if (!sub) throw new NotFoundError("Subscription");
        if (sub.stripeSubscriptionId) {
          throw new BusinessRuleError("This subscription is billed through Stripe. Manage it in Stripe.");
        }
        if (!isLive(sub.status)) {
          throw new BusinessRuleError("This subscription has ended. Assign a new plan instead.");
        }

        const now = new Date();
        const set: Partial<typeof subscriptions.$inferInsert> = {};
        const meta: Record<string, unknown> = { previousStatus: sub.status };

        switch (data.op) {
          case "pause":
            if (sub.status === "PAUSED") throw new BusinessRuleError("Already paused.");
            set.status = "PAUSED";
            break;
          case "resume":
            if (sub.status !== "PAUSED") throw new BusinessRuleError("Only a paused subscription can be resumed.");
            set.status = "ACTIVE";
            break;
          case "keep":
            if (!sub.cancelAtPeriodEnd) throw new BusinessRuleError("No cancellation is scheduled.");
            set.cancelAtPeriodEnd = false;
            break;
          case "change_plan": {
            if (data.planId === sub.planId) throw new BusinessRuleError("The family is already on that plan.");
            const plan = await tx.query.plans.findFirst({
              where: and(eq(plans.id, data.planId), eq(plans.orgId, sub.orgId)),
              columns: { id: true, name: true, isActive: true },
            });
            if (!plan) throw new NotFoundError("Plan");
            if (!plan.isActive) throw new BusinessRuleError(`"${plan.name}" is retired.`);
            set.planId = plan.id;
            Object.assign(meta, { previousPlanId: sub.planId, planId: plan.id, planName: plan.name });
            break;
          }
          case "extend": {
            const zone = data.timeZone && isValidZone(data.timeZone) ? data.timeZone : "UTC";
            const until = dayStartInZone(data.untilDay, zone);
            if (Number.isNaN(until.getTime())) throw new BusinessRuleError("That date isn't a real day.");
            if (until <= sub.currentPeriodEnd) throw new BusinessRuleError("Pick a date after the current end.");
            if (until <= now) throw new BusinessRuleError("Pick a date in the future.");
            set.currentPeriodEnd = until;
            Object.assign(meta, {
              previousPeriodEnd: sub.currentPeriodEnd.toISOString(),
              periodEnd: until.toISOString(),
            });
            break;
          }
          case "cancel":
            if (data.when === "period_end") {
              if (sub.cancelAtPeriodEnd) throw new BusinessRuleError("Already set to end with this period.");
              if (sub.currentPeriodEnd <= now) {
                throw new BusinessRuleError("This period has already ended. Cancel now instead.");
              }
              set.cancelAtPeriodEnd = true;
            } else {
              set.status = "CANCELLED";
              set.cancelAtPeriodEnd = false;
              // The period stops today, so "ended on" reads true afterwards.
              if (sub.currentPeriodEnd > now) set.currentPeriodEnd = now;
              meta.previousPeriodEnd = sub.currentPeriodEnd.toISOString();
            }
            break;
        }

        const [updated] = await tx
          .update(subscriptions)
          .set(set)
          .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.orgId, sub.orgId)))
          .returning();
        return { updated, meta };
      });

      const { updated, meta } = result;
      const op =
        data.op === "cancel"
          ? `subscription.cancel.${data.when}`
          : data.op === "keep"
            ? "subscription.uncancel"
            : `subscription.${data.op}`;

      await logAudit({
        orgId: updated.orgId,
        actorId: ctx.userId,
        action: data.op === "cancel" ? "SUBSCRIPTION_CANCELLED" : "SETTINGS_CHANGED",
        target: `subscription:${updated.id}`,
        metadata: { op, userId: updated.userId, status: updated.status, ...meta },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ subscription: updated });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
