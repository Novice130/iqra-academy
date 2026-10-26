/**
 * @fileoverview Refunds against an invoice.
 *
 * RBAC: ORG_ADMIN and above.
 * POST /api/admin/refunds — { invoiceId, amountCents?, reason }
 *
 * ── Why it takes an invoice, not a payment intent ───────────────────────────
 * This route used to accept any Stripe paymentIntentId and refund it. Stripe
 * has one account for every school on the platform, so an admin of one org
 * could refund another org's payment by pasting its id. Now the caller names
 * one of their own invoices, the route loads it org-scoped, and the amount is
 * capped at what that invoice says was paid.
 *
 * ── What a refund does here ─────────────────────────────────────────────────
 * Every invoice this school raises is paid outside the app (bank transfer,
 * Zelle; see api/admin/invoices), so the money goes back the same way and
 * this route records it: `amountPaidCents` goes down and a line is added to
 * `notes`. Only a PAID invoice refunded in full becomes VOID; see the status
 * rule in the handler. The schema has no REFUNDED status and no refund
 * table, and this is the most it can say without a migration; the audit
 * entry carries the detail.
 *
 * Stripe-billed rows (`stripeInvoiceId` set) are refused. The table stores no
 * payment intent for them, and looking one up through Stripe is not something
 * lib/stripe.ts offers, so they are refunded from the Stripe dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withDb, withRLS } from "@/lib/db";
import { invoices } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, BusinessRuleError, ConflictError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { money } from "@/lib/money";

const refundSchema = z.object({
  invoiceId: z.string().min(1),
  /** Cents. Omitted means everything that was paid. */
  amountCents: z.number().int().positive().max(10_000_00).optional(),
  reason: z.string().trim().min(1, "Say why").max(500),
});

/** Notes is free text shown on the invoice email; keep it a sane length. */
const NOTES_MAX = 2000;

/** POST /api/admin/refunds — record a refund against one invoice. */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = refundSchema.parse(await request.json());

      const result = await withRLS(ctx, async (tx) => {
        const existing = await tx.query.invoices.findFirst({
          where: and(
            eq(invoices.id, data.invoiceId),
            ctx.role === "SUPER_ADMIN" ? undefined : eq(invoices.orgId, ctx.orgId)
          ),
          columns: {
            id: true, orgId: true, status: true, amountPaidCents: true,
            currency: true, notes: true, stripeInvoiceId: true,
          },
        });
        if (!existing) throw new NotFoundError("Invoice");

        if (existing.stripeInvoiceId) {
          throw new BusinessRuleError(
            "This invoice was billed through Stripe and has no stored payment reference. Refund it from the Stripe dashboard."
          );
        }
        if (existing.amountPaidCents <= 0) {
          throw new BusinessRuleError("Nothing has been paid on this invoice, so there is nothing to refund.");
        }

        const amount = data.amountCents ?? existing.amountPaidCents;
        if (amount > existing.amountPaidCents) {
          throw new BusinessRuleError(
            `A refund can't be more than the ${money(existing.amountPaidCents, existing.currency)} paid.`
          );
        }

        const remaining = existing.amountPaidCents - amount;
        const line = `[Refund ${new Date().toISOString().slice(0, 10)}] ${money(amount, existing.currency)}: ${data.reason}`;
        const notes = (existing.notes ? `${existing.notes}\n${line}` : line).slice(-NOTES_MAX);
        // A refund is the school giving money back, not a debt coming back
        // into being. So a PAID invoice stays PAID after a partial refund
        // (settled, for less), and becomes VOID only when all of it went back
        // and nothing is held. An OPEN/OVERDUE/DRAFT invoice keeps its status
        // whatever is refunded: the full amount is still owed, and voiding it
        // would drop that debt out of the open and overdue totals.
        const status = existing.status === "PAID" && remaining === 0 ? ("VOID" as const) : existing.status;

        // Matching on the amount we read makes two refunds racing each other
        // fail rather than both subtract from the same balance.
        const [invoice] = await tx
          .update(invoices)
          .set({ amountPaidCents: remaining, notes, status })
          .where(
            and(
              eq(invoices.id, existing.id),
              eq(invoices.orgId, existing.orgId),
              eq(invoices.amountPaidCents, existing.amountPaidCents)
            )
          )
          .returning();
        if (!invoice) {
          throw new ConflictError("This invoice changed while you were refunding it. Reload and try again.");
        }

        return { invoice, amount, previousStatus: existing.status, previousPaidCents: existing.amountPaidCents };
      });

      await logAudit({
        orgId: result.invoice.orgId,
        actorId: ctx.userId,
        action: "REFUND_ISSUED",
        target: `invoice:${result.invoice.id}`,
        metadata: {
          method: "manual",
          amountCents: result.amount,
          currency: result.invoice.currency,
          reason: data.reason,
          previousPaidCents: result.previousPaidCents,
          remainingPaidCents: result.invoice.amountPaidCents,
          previousStatus: result.previousStatus,
          status: result.invoice.status,
        },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ invoice: result.invoice, refundedCents: result.amount });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
