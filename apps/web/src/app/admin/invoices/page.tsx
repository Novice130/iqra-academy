/**
 * @fileoverview /admin/invoices — Raise invoices and record manual/wire payments.
 *
 * Server component for the auth gate and first paint.
 * Uses Tailwind CSS layout integrated with AdminLayout.
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
      <div className="space-y-6 animate-fadeIn">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] mb-1">
              <Link href="/admin" className="hover:text-[var(--accent)] transition">
                Admin
              </Link>
              <span>/</span>
              <span>Invoices & Payments</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Invoices & Billing Desk
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Issue custom or manual invoices, email payment reminders, and record bank wire transfers.
            </p>
          </div>

          <Link
            href="/admin"
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition self-start sm:self-auto"
          >
            ← Back to Overview
          </Link>
        </div>

        {/* Invoice Desk Component */}
        <div className="p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-sm">
          <InvoiceDesk families={families} initialInvoices={initial} />
        </div>
      </div>
    );
  });
}
