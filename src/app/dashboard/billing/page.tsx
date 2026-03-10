/**
 * Billing Page — Subscription management and payment history
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const PLANS = [
  { name: "Free Trial", price: "$0", period: "7 days", features: ["1 free class", "Meet your teacher", "No commitment"], current: false },
  { name: "1:1 Premium", price: "$70", period: "/month", features: ["4 classes/week", "Dedicated teacher", "Progress reports", "Flexible scheduling"], current: true },
  { name: "Group Class", price: "$50", period: "/month", features: ["4 classes/week", "2-3 students", "Interactive learning", "Lower cost"], current: false },
  { name: "Siblings Plan", price: "$100", period: "/month", features: ["4 classes/week", "Up to 3 siblings", "Best value", "Family discount"], current: false },
];

const PAYMENT_HISTORY = [
  { date: "Mar 1, 2026", amount: "$70.00", plan: "1:1 Premium", status: "paid" },
  { date: "Feb 1, 2026", amount: "$70.00", plan: "1:1 Premium", status: "paid" },
  { date: "Jan 1, 2026", amount: "$70.00", plan: "1:1 Premium", status: "paid" },
  { date: "Dec 1, 2025", amount: "$0.00", plan: "Free Trial", status: "trial" },
];

export default async function BillingPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  const user = session?.user as { name?: string } | undefined;

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
              Your next billing date is <strong>April 1, 2026</strong>
            </p>
          </div>
          <div className="badge badge-accent">Active</div>
        </div>
        <div className="p-5 flex items-center gap-4">
          <div className="text-3xl font-bold" style={{ color: "var(--accent)" }}>$70</div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>1:1 Premium Plan</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>4 classes per week • Dedicated teacher</div>
          </div>
        </div>
      </section>

      {/* Plan options */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
          Available Plans
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="card p-5 relative"
              style={{
                border: plan.current ? "2px solid var(--accent)" : undefined,
              }}
            >
              {plan.current && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>
                  CURRENT
                </div>
              )}
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{plan.name}</div>
              <div className="mb-3">
                <span className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{plan.price}</span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{plan.period}</span>
              </div>
              <ul className="space-y-1.5 mb-4">
                {plan.features.map((f) => (
                  <li key={f} className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--accent)" }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <button
                className="w-full py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: plan.current ? "var(--bg-secondary)" : "var(--accent)",
                  color: plan.current ? "var(--text-tertiary)" : "#fff",
                  border: plan.current ? "1px solid var(--border)" : undefined,
                }}
                disabled={plan.current}
              >
                {plan.current ? "Current Plan" : "Switch Plan"}
              </button>
            </div>
          ))}
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
                <th className="text-left text-[11px] font-semibold uppercase tracking-widest px-5 py-3" style={{ color: "var(--text-tertiary)" }}>Plan</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-widest px-5 py-3" style={{ color: "var(--text-tertiary)" }}>Amount</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-widest px-5 py-3" style={{ color: "var(--text-tertiary)" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {PAYMENT_HISTORY.map((payment, i) => (
                <tr key={i} style={{ borderBottom: i < PAYMENT_HISTORY.length - 1 ? "1px solid var(--border)" : undefined }}>
                  <td className="px-5 py-3.5 text-sm" style={{ color: "var(--text-primary)" }}>{payment.date}</td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: "var(--text-secondary)" }}>{payment.plan}</td>
                  <td className="px-5 py-3.5 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{payment.amount}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase"
                      style={{
                        background: payment.status === "paid" ? "#dcfce7" : "#f0f9ff",
                        color: payment.status === "paid" ? "#166534" : "#0369a1",
                      }}
                    >
                      {payment.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
