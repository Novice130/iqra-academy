/**
 * @fileoverview Invoices raised by hand.
 *
 * RBAC: ORG_ADMIN and above.
 * GET   /api/admin/invoices — the org's invoices, newest first
 * POST  /api/admin/invoices — raise one, and email it
 * PATCH /api/admin/invoices — record a payment, or void one
 *
 * ── Why this is not Stripe ──────────────────────────────────────────────────
 * Families here pay by bank transfer or Zelle after agreeing a fee over
 * WhatsApp (see lib/stripe.ts and lib/pricing-visibility.ts). The `invoices`
 * table was built as a mirror of Stripe's, and until now nothing but a
 * webhook could write to it — which meant every real invoice this school has
 * sent exists only in somebody's sent mail. `issued_by_id` and `notes`
 * (migration 0004) are what let a hand-raised row answer "who charged this,
 * and why" six months later.
 *
 * `stripeInvoiceId` stays null on these rows. That is how a hand-raised
 * invoice is told apart from a Stripe one, and it is why `hostedInvoiceUrl`
 * is writable here: a payment link pasted in by an admin lands in the same
 * column Stripe's hosted page would have.
 *
 * ── Where the amount is allowed to appear ───────────────────────────────────
 * In the email, and on staff screens. Never in the in-app notification or the
 * push payload — those render inside the app, where showing prices would
 * undo the App Store position lib/pricing-visibility.ts exists to hold. So
 * this route sends its own email through sendInvoiceEmail and asks notify()
 * for the other two channels only, rather than letting notify() mail a
 * generic body.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withDb, withRLS } from "@/lib/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  invoices,
  organizations,
  plans,
  studentProfiles,
  subscriptions,
  users,
} from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import {
  handleApiError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { sendInvoiceEmail } from "@/lib/email";

/** A month of classes, near enough, when no period is given. */
const DEFAULT_PERIOD_DAYS = 30;
/** Long enough for a bank transfer to clear, short enough to chase. */
const DEFAULT_DUE_DAYS = 7;

const createSchema = z.object({
  userId: z.string().min(1),
  /**
   * Cents, not dollars. Optional: an admin who leaves it blank gets the
   * price of the family's active plan, which is the common case and the one
   * where a typed figure is most likely to disagree with the plan.
   */
  amountCents: z.number().int().positive().max(10_000_00).optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
  /** A Stripe payment link, or anything else the family can pay through. */
  payUrl: z.string().url().max(2000).optional(),
  /** Off for a figure being recorded after the fact. */
  send: z.boolean().default(true),
});

const updateSchema = z.object({
  invoiceId: z.string().min(1),
  status: z.enum(["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE", "OVERDUE"]).optional(),
  /** Defaults to the full amount when marking PAID. A part payment says so. */
  amountPaidCents: z.number().int().min(0).max(10_000_00).optional(),
  notes: z.string().max(1000).optional(),
});

/** "$120.00" */
function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** "1 – 30 September" for a range, "September 2026" when it is a whole month. */
function periodLabel(start: Date | null, end: Date | null): string {
  if (!start || !end) return "your classes";
  const month = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return month.format(start);
  }
  return `${day.format(start)} – ${day.format(end)}`;
}

function dateLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(d);
}

/** GET /api/admin/invoices — list, newest first. */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status");
      const userId = searchParams.get("userId");
      const limit = Math.min(Number(searchParams.get("limit") ?? 100) || 100, 500);

      return await withRLS(ctx, async (tx) => {
        const conditions = [eq(invoices.orgId, ctx.orgId)];
        if (status) {
          conditions.push(eq(invoices.status, status as typeof invoices.status.enumValues[number]));
        }
        if (userId) conditions.push(eq(invoices.userId, userId));

        const rows = await tx
          .select({
            id: invoices.id,
            userId: invoices.userId,
            userName: users.name,
            userEmail: users.email,
            status: invoices.status,
            amountDueCents: invoices.amountDueCents,
            amountPaidCents: invoices.amountPaidCents,
            currency: invoices.currency,
            notes: invoices.notes,
            hostedInvoiceUrl: invoices.hostedInvoiceUrl,
            stripeInvoiceId: invoices.stripeInvoiceId,
            issuedById: invoices.issuedById,
            dueDate: invoices.dueDate,
            paidAt: invoices.paidAt,
            periodStart: invoices.periodStart,
            periodEnd: invoices.periodEnd,
            createdAt: invoices.createdAt,
          })
          .from(invoices)
          .innerJoin(users, eq(users.id, invoices.userId))
          .where(and(...conditions))
          .orderBy(desc(invoices.createdAt))
          .limit(limit);

        return NextResponse.json({ invoices: rows });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/** POST /api/admin/invoices — raise one against a family. */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = createSchema.parse(await request.json());

      const now = new Date();
      const periodStart = data.periodStart ? new Date(data.periodStart) : now;
      const periodEnd = data.periodEnd
        ? new Date(data.periodEnd)
        : new Date(periodStart.getTime() + DEFAULT_PERIOD_DAYS * 86_400_000);
      const dueDate = data.dueDate
        ? new Date(data.dueDate)
        : new Date(now.getTime() + DEFAULT_DUE_DAYS * 86_400_000);

      if (periodEnd <= periodStart) {
        throw new BusinessRuleError("The billing period ends before it starts.");
      }

      const result = await withRLS(ctx, async (tx) => {
        const family = await tx.query.users.findFirst({
          where: and(
            eq(users.id, data.userId),
            eq(users.orgId, ctx.orgId),
            isNull(users.deletedAt)
          ),
          columns: { id: true, name: true, email: true },
        });
        if (!family) throw new NotFoundError("User");

        // The family's plan supplies the amount when none was typed, and the
        // plan name and student count for the email either way.
        const sub = await tx
          .select({
            subscriptionId: subscriptions.id,
            planName: plans.name,
            priceInCents: plans.priceInCents,
            currency: plans.currency,
            maxStudents: plans.maxStudents,
          })
          .from(subscriptions)
          .innerJoin(plans, eq(plans.id, subscriptions.planId))
          .where(
            and(
              eq(subscriptions.userId, family.id),
              eq(subscriptions.orgId, ctx.orgId),
              inArray(subscriptions.status, ["ACTIVE", "PAST_DUE", "UNPAID"])
            )
          )
          .orderBy(desc(subscriptions.currentPeriodEnd))
          .limit(1);

        const plan = sub[0];
        const amountDueCents = data.amountCents ?? plan?.priceInCents;
        if (!amountDueCents) {
          throw new BusinessRuleError(
            "This family has no subscription to take a price from. Enter an amount."
          );
        }

        // Two taps on a slow connection must not raise two invoices. Same
        // family, same period, still unpaid is the shape that means "again",
        // and it is checked inside the transaction so the second one loses.
        const duplicate = await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(
              eq(invoices.userId, family.id),
              eq(invoices.orgId, ctx.orgId),
              inArray(invoices.status, ["DRAFT", "OPEN", "OVERDUE"]),
              eq(invoices.periodStart, periodStart)
            )
          )
          .limit(1);
        if (duplicate.length > 0) {
          throw new ConflictError(
            "There's already an unpaid invoice for this family and period."
          );
        }

        const [{ n: childCount }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(studentProfiles)
          .where(eq(studentProfiles.userId, family.id));

        const org = await tx.query.organizations.findFirst({
          where: eq(organizations.id, ctx.orgId),
          columns: { name: true },
        });

        const [invoice] = await tx
          .insert(invoices)
          .values({
            orgId: ctx.orgId,
            userId: family.id,
            subscriptionId: plan?.subscriptionId ?? null,
            // OPEN, not DRAFT: it is being sent. DRAFT is for a figure an
            // admin is still deciding on, which this route does not produce.
            status: "OPEN",
            amountDueCents,
            amountPaidCents: 0,
            currency: plan?.currency ?? "usd",
            hostedInvoiceUrl: data.payUrl ?? null,
            issuedById: ctx.userId,
            notes: data.notes ?? null,
            dueDate,
            periodStart,
            periodEnd,
          })
          .returning();

        return {
          invoice,
          family,
          planName: plan?.planName ?? "Quran classes",
          studentCount: Math.max(childCount || 0, plan?.maxStudents ?? 1, 1),
          orgName: org?.name ?? "Novice Tutor",
        };
      });

      await logAudit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "INVOICE_ISSUED",
        target: `invoice:${result.invoice.id}`,
        metadata: {
          userId: result.family.id,
          amountDueCents: result.invoice.amountDueCents,
          currency: result.invoice.currency,
          notes: data.notes ?? null,
        },
        ipAddress: getClientIp(request.headers),
      });

      // Outside the transaction on purpose: Resend and FCM are network calls,
      // and holding a Postgres interactive transaction open across one on a
      // Worker is how a request runs out of time (same reasoning as
      // api/admin/users PATCH).
      if (data.send && result.family.email) {
        await sendInvoiceEmail(result.family.email, {
          name: result.family.name || "there",
          orgName: result.orgName,
          planName: result.planName,
          amount: money(result.invoice.amountDueCents, result.invoice.currency),
          studentCount: result.studentCount,
          periodLabel: periodLabel(result.invoice.periodStart, result.invoice.periodEnd),
          dueLabel: dateLabel(dueDate),
          payUrl: result.invoice.hostedInvoiceUrl ?? undefined,
        });

        await notify({
          orgId: ctx.orgId,
          userIds: [result.family.id],
          type: "INVOICE_ISSUED",
          title: "Your invoice is ready",
          // No amount here — this text is the in-app row and the push body.
          body: "We've emailed your invoice. Tap to see your billing.",
          path: "/dashboard/billing",
          channels: ["inapp", "push"],
        });
      }

      return NextResponse.json({ invoice: result.invoice }, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/**
 * PATCH /api/admin/invoices — record a payment, or void one.
 *
 * A payment arrives in a bank account, not through this app, so somebody has
 * to say so. Marking PAID stamps `paidAt` and fills `amountPaidCents` with
 * the full amount unless a part payment was named.
 */
export async function PATCH(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = updateSchema.parse(await request.json());
      if (!data.status && data.amountPaidCents === undefined && data.notes === undefined) {
        throw new BusinessRuleError("Nothing to update.");
      }

      const result = await withRLS(ctx, async (tx) => {
        const existing = await tx.query.invoices.findFirst({
          where: and(eq(invoices.id, data.invoiceId), eq(invoices.orgId, ctx.orgId)),
          columns: {
            id: true, status: true, amountDueCents: true,
            amountPaidCents: true, userId: true, currency: true,
          },
        });
        if (!existing) throw new NotFoundError("Invoice");

        // Voiding a settled invoice loses the record that money arrived.
        // Refunds are a separate act with their own audit action.
        if (
          existing.status === "PAID" &&
          (data.status === "VOID" || data.status === "UNCOLLECTIBLE")
        ) {
          throw new BusinessRuleError(
            "This invoice is already paid. Issue a refund rather than voiding it."
          );
        }

        const updates: Record<string, unknown> = {};
        if (data.notes !== undefined) updates.notes = data.notes === "" ? null : data.notes;
        if (data.status) updates.status = data.status;
        if (data.amountPaidCents !== undefined) updates.amountPaidCents = data.amountPaidCents;

        if (data.status === "PAID") {
          updates.paidAt = new Date();
          if (data.amountPaidCents === undefined) {
            updates.amountPaidCents = existing.amountDueCents;
          }
        }
        if (data.status === "VOID" || data.status === "UNCOLLECTIBLE") {
          updates.paidAt = null;
        }

        const [invoice] = await tx
          .update(invoices)
          .set(updates)
          .where(and(eq(invoices.id, data.invoiceId), eq(invoices.orgId, ctx.orgId)))
          .returning();

        return { invoice, previousStatus: existing.status };
      });

      // Only the two statuses that move money get their own audit line.
      // OVERDUE and OPEN are bookkeeping, and a log full of them buries the
      // entries somebody actually goes looking for.
      const auditAction =
        data.status === "PAID"
          ? ("INVOICE_PAID" as const)
          : data.status === "VOID" || data.status === "UNCOLLECTIBLE"
            ? ("INVOICE_VOIDED" as const)
            : null;

      if (auditAction) {
        await logAudit({
          orgId: ctx.orgId,
          actorId: ctx.userId,
          action: auditAction,
          target: `invoice:${result.invoice.id}`,
          metadata: {
            previousStatus: result.previousStatus,
            status: result.invoice.status,
            amountPaidCents: result.invoice.amountPaidCents,
          },
          ipAddress: getClientIp(request.headers),
        });
      }

      return NextResponse.json({ invoice: result.invoice });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
