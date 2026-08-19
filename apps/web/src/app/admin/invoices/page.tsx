/**
 * @fileoverview /admin/invoices — raise an invoice, and see who has paid.
 *
 * The counterpart to api/admin/invoices. Before this page, sendInvoiceEmail()
 * had been written and was called by nothing at all: invoicing happened in
 * WhatsApp and lived nowhere the school could total up.
 *
 * Server component for the auth gate and the first paint. The desk itself is
 * a client component because raising an invoice and recording a payment are
 * both mutations.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { db, withDb } from "@/lib/db";
import { invoices, plans, subscriptions, users } from "@/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import InvoiceDesk, { type FamilyOption, type InvoiceRow } from "./InvoiceDesk";

export const dynamic = "force-dynamic";

export default async function AdminInvoicesPage() {
  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) redirect("/login?redirect=/admin/invoices");

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true, orgId: true },
    });

    const role = dbUser?.role || "STUDENT";
    if (!canAccessAdmin(role)) redirect("/dashboard?error=unauthorized");
    const orgId = dbUser!.orgId;

    // Everybody who can be invoiced, with the plan that supplies the default
    // amount. Left join: a family with no subscription is exactly who an
    // admin needs to invoice by hand, so they must still appear in the list —
    // they just arrive with no suggested figure.
    const familyRows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        planName: plans.name,
        priceInCents: plans.priceInCents,
        currency: plans.currency,
      })
      .from(users)
      .leftJoin(
        subscriptions,
        and(
          eq(subscriptions.userId, users.id),
          inArray(subscriptions.status, ["ACTIVE", "PAST_DUE", "UNPAID"])
        )
      )
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(
        and(eq(users.orgId, orgId), eq(users.role, "STUDENT"), isNull(users.deletedAt))
      )
      .orderBy(users.name);

    // The left join can return a family twice if they somehow hold two live
    // subscriptions. First row wins — they are ordered by name, and a
    // duplicated option in a <select> is a bug report.
    const seen = new Set<string>();
    const families: FamilyOption[] = [];
    for (const f of familyRows) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      families.push({
        id: f.id,
        name: f.name,
        email: f.email,
        planName: f.planName,
        priceInCents: f.priceInCents,
        currency: f.currency ?? "usd",
      });
    }

    const rows = await db
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
        stripeInvoiceId: invoices.stripeInvoiceId,
        dueDate: invoices.dueDate,
        paidAt: invoices.paidAt,
        periodStart: invoices.periodStart,
        periodEnd: invoices.periodEnd,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .innerJoin(users, eq(users.id, invoices.userId))
      .where(eq(invoices.orgId, orgId))
      .orderBy(desc(invoices.createdAt))
      .limit(200);

    const initial: InvoiceRow[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      status: r.status,
      amountDueCents: r.amountDueCents,
      amountPaidCents: r.amountPaidCents,
      currency: r.currency,
      notes: r.notes,
      manual: r.stripeInvoiceId === null,
      dueDate: r.dueDate?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      periodStart: r.periodStart?.toISOString() ?? null,
      periodEnd: r.periodEnd?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
        <header
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
            padding: "24px 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#fff" }}>
              Invoices
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#a7f3d0" }}>
              Raise one, email it, and record the payment when it lands
            </p>
          </div>
          <Link href="/admin" style={{ color: "#a7f3d0", textDecoration: "none", fontSize: "14px" }}>
            ← Admin
          </Link>
        </header>

        <main style={{ padding: "24px 32px" }}>
          <InvoiceDesk families={families} initialInvoices={initial} />
        </main>
      </div>
    );
  });
}
