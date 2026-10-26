/**
 * @fileoverview Invoices raised by hand.
 *
 * RBAC: ORG_ADMIN and above. An ORG_ADMIN acts on their own org; a
 * SUPER_ADMIN may act on any org's family or invoice, and the row keeps the
 * family's org rather than the admin's.
 * POST  /api/admin/invoices — raise one, and email it
 * PATCH /api/admin/invoices — record a payment, or void one
 *
 * The list lives on the /admin/invoices page, which reads the table itself;
 * the GET that used to sit here had no caller and was removed. Refunds are
 * api/admin/refunds.
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
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
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
import { money } from "@/lib/money";
import { zonedDayParts, zonedWallClockToInstant } from "@/lib/slots";
import { isValidZone } from "@/lib/zones";

/** A month of classes, near enough, when no period is given. */
const DEFAULT_PERIOD_DAYS = 30;
/** Long enough for a bank transfer to clear, short enough to chase. */
const DEFAULT_DUE_DAYS = 7;

/** A calendar day as typed in a date input. */
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

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
  /**
   * The same three as calendar days in `timeZone` — what the admin form
   * sends. They win over the instants above when both are given.
   */
  periodStartDay: dayString.optional(),
  periodEndDay: dayString.optional(),
  dueDay: dayString.optional(),
  /** The viewer's IANA zone, for reading the days above and for the email. */
  timeZone: z.string().max(64).optional(),
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

/** `column = orgId` for an ORG_ADMIN; nothing for a SUPER_ADMIN. */
function orgScope(ctx: { role: string; orgId: string }, column: PgColumn): SQL | undefined {
  return ctx.role === "SUPER_ADMIN" ? undefined : eq(column, ctx.orgId);
}

/**
 * The instant a calendar day starts (or a wall-clock time on it) in `zone`.
 * The form sends days, not instants: "due 7 October" has to mean the admin's
 * 7 October, and only the zone they were looking at can say when that is.
 */
function dayInZone(day: string, zone: string, hh = 0, mm = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  return zonedWallClockToInstant(y, m, d, hh, mm, zone);
}

/** "September 2026" for a whole month, "1 Sep – 15 Oct" otherwise, in `zone`. */
function periodLabel(start: Date | null, end: Date | null, zone: string): string {
  if (!start || !end) return "your classes";
  const a = zonedDayParts(start, zone);
  const b = zonedDayParts(end, zone);
  if (a.y === b.y && a.m === b.m) {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: zone }).format(start);
  }
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: zone });
  return `${day.format(start)} – ${day.format(end)}`;
}

function dateLabel(d: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: zone,
  }).format(d);
}

/** POST /api/admin/invoices — raise one against a family. */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = createSchema.parse(await request.json());

      const zone = data.timeZone && isValidZone(data.timeZone) ? data.timeZone : "UTC";
      const now = new Date();
      const periodStart = data.periodStartDay
        ? dayInZone(data.periodStartDay, zone)
        : data.periodStart ? new Date(data.periodStart) : now;
      const periodEnd = data.periodEndDay
        ? dayInZone(data.periodEndDay, zone)
        : data.periodEnd
          ? new Date(data.periodEnd)
          : new Date(periodStart.getTime() + DEFAULT_PERIOD_DAYS * 86_400_000);
      // The last minute of the due day, so "due 7 October" is not overdue
      // for the whole of 7 October.
      const dueDate = data.dueDay
        ? dayInZone(data.dueDay, zone, 23, 59)
        : data.dueDate
          ? new Date(data.dueDate)
          : new Date(now.getTime() + DEFAULT_DUE_DAYS * 86_400_000);

      if (periodEnd <= periodStart) {
        throw new BusinessRuleError("The billing period ends before it starts.");
      }

      const result = await withRLS(ctx, async (tx) => {
        const family = await tx.query.users.findFirst({
          where: and(
            eq(users.id, data.userId),
            orgScope(ctx, users.orgId),
            isNull(users.deletedAt)
          ),
          columns: { id: true, orgId: true, name: true, email: true },
        });
        if (!family) throw new NotFoundError("User");
        // The family's org, which is the admin's own unless a SUPER_ADMIN
        // is billing another school's family.
        const orgId = family.orgId;

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
              eq(subscriptions.orgId, orgId),
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
              eq(invoices.orgId, orgId),
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
          where: eq(organizations.id, orgId),
          columns: { name: true },
        });

        const [invoice] = await tx
          .insert(invoices)
          .values({
            orgId,
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
        orgId: result.invoice.orgId,
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
          periodLabel: periodLabel(result.invoice.periodStart, result.invoice.periodEnd, zone),
          dueLabel: dateLabel(dueDate, zone),
          payUrl: result.invoice.hostedInvoiceUrl ?? undefined,
        });

        await notify({
          orgId: result.invoice.orgId,
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
          where: and(eq(invoices.id, data.invoiceId), orgScope(ctx, invoices.orgId)),
          columns: {
            id: true, orgId: true, status: true, amountDueCents: true,
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
          .where(and(eq(invoices.id, data.invoiceId), eq(invoices.orgId, existing.orgId)))
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
          orgId: result.invoice.orgId,
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
