/**
 * Billing Page — Subscription management and payment history
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { subscriptions, plans, invoices } from "@/db/schema";
import { format } from "date-fns";

export default async function BillingPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) return null;

  const user = session.user as { id: string; orgId: string };

  // 1. Fetch All Available Plans
  const availablePlans = await db.query.plans.findMany({
    where: and(eq(plans.orgId, user.orgId), eq(plans.isActive, true)),
    orderBy: asc(plans.priceInCents),
  });

  // 2. Fetch Active Subscription
  const activeSub = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.userId, user.id),
      eq(subscriptions.status, "ACTIVE")
    ),
    with: { plan: true },
  });

  // 3. Fetch Payment History (Invoices)
  const history = await db.query.invoices.findMany({
    where: eq(invoices.userId, user.id),
    orderBy: [desc(invoices.createdAt)],
    limit: 10,
  });

  const getPlanFeatures = (plan: typeof plans.$inferSelect) => {
    const features = [
      `${plan.classesPerWeek} classes/week`,
      plan.sessionType === "INDIVIDUAL" ? "1:1 Private lessons" : `${plan.sessionType.toLowerCase()} sessions`,
      "Dedicated teacher",
      "Progress reports",
    ];
    if (plan.tier === "SIBLINGS") features.push(`Up to ${plan.maxStudents} siblings`);
    return features;
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Billing
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Manage your subscription and view payment history
        </p>
      </div>

      {/* Current plan */}
      <section className="card mb-8">
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Current Plan</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {activeSub ? (
                <>Your next billing date is <strong>{format(activeSub.currentPeriodEnd, "MMMM d, yyyy")}</strong></>
              ) : (
                "You don't have an active subscription."
              )}
            </p>
          </div>
          <div className={`badge ${activeSub ? "badge-accent" : "badge-outline"}`}>
            {activeSub ? "Active" : "No Plan"}
          </div>
        </div>
        {activeSub && (
          <div className="p-5 flex items-center gap-4">
            <div className="text-3xl font-bold" style={{ color: "var(--accent)" }}>
              ${activeSub.plan.priceInCents / 100}
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {activeSub.plan.name}
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {activeSub.plan.classesPerWeek} classes per week • {activeSub.plan.sessionType.toLowerCase()} sessions
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Plan options */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Available Plans
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {availablePlans.map((plan) => {
            const isCurrent = activeSub?.planId === plan.id;
            const features = getPlanFeatures(plan);
            return (
              <div
                key={plan.id}
                className="card p-5 relative"
                style={{
                  border: isCurrent ? "2px solid var(--accent)" : undefined,
                }}
              >
                {isCurrent && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>
                    CURRENT
                  </div>
                )}
                <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{plan.name}</div>
                <div className="mb-3">
                  <span className="text-2xl font-bold" style={{ color: "var(--accent)" }}>${plan.priceInCents / 100}</span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>/mo</span>
                </div>
                <ul className="space-y-1.5 mb-4">
                  {features.map((f) => (
                    <li key={f} className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--accent)" }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  className="w-full py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{
                    background: isCurrent ? "var(--bg-secondary)" : "var(--accent)",
                    color: isCurrent ? "var(--text-tertiary)" : "#fff",
                    border: isCurrent ? "1px solid var(--border)" : undefined,
                  }}
                  disabled={isCurrent}
                >
                  {isCurrent ? "Current Plan" : "Switch Plan"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Payment history */}
      <section className="card">
        <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Payment History
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-widest px-5 py-3" style={{ color: "var(--text-tertiary)" }}>Date</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-widest px-5 py-3" style={{ color: "var(--text-tertiary)" }}>Amount</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-widest px-5 py-3" style={{ color: "var(--text-tertiary)" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length > 0 ? (
                history.map((invoice, i) => (
                  <tr key={invoice.id} style={{ borderBottom: i < history.length - 1 ? "1px solid var(--border)" : undefined }}>
                    <td className="px-5 py-3.5 text-sm" style={{ color: "var(--text-primary)" }}>
                      {format(invoice.createdAt, "MMM d, yyyy")}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      ${invoice.amountPaidCents / 100}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase"
                        style={{
                          background: invoice.status === "PAID" ? "#dcfce7" : "#fee2e2",
                          color: invoice.status === "PAID" ? "#166534" : "#991b1b",
                        }}
                      >
                        {invoice.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                    No payment history found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
