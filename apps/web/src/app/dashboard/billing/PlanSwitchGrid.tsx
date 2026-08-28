"use client";

/**
 * PlanSwitchGrid — Interactive Plan selection and switcher for the Billing page.
 */

import { useState } from "react";
import Link from "next/link";

export interface PlanItem {
  id: string;
  name: string;
  priceInCents: number;
  classesPerWeek: number;
  sessionType: string;
  tier: string;
  maxStudents: number;
}

export default function PlanSwitchGrid({
  plans,
  currentPlanId,
  hidePricing,
}: {
  plans: PlanItem[];
  currentPlanId?: string | null;
  hidePricing: boolean;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const getPlanFeatures = (plan: PlanItem) => {
    const features = [
      `${plan.classesPerWeek} classes/week`,
      plan.sessionType === "INDIVIDUAL" ? "1:1 Private lessons" : `${plan.sessionType.toLowerCase()} sessions`,
      "Dedicated teacher",
      "Progress reports",
    ];
    if (plan.tier === "SIBLINGS") features.push(`Up to ${plan.maxStudents} siblings`);
    return features;
  };

  const handleSelectPlan = (plan: PlanItem) => {
    setSelectedPlan(plan);
    setModalOpen(true);
  };

  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => {
          const isCurrent = currentPlanId === plan.id;
          const features = getPlanFeatures(plan);
          return (
            <div
              key={plan.id}
              className="card p-5 relative flex flex-col justify-between"
              style={{
                border: isCurrent ? "2px solid var(--accent)" : undefined,
              }}
            >
              <div>
                {isCurrent && (
                  <div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold text-white shadow-xs"
                    style={{ background: "var(--accent)" }}
                  >
                    CURRENT
                  </div>
                )}
                <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  {plan.name}
                </div>
                {!hidePricing && (
                  <div className="mb-3">
                    <span className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
                      ${plan.priceInCents / 100}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      /mo
                    </span>
                  </div>
                )}
                <ul className="space-y-1.5 mb-4">
                  {features.map((f) => (
                    <li key={f} className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--accent)" }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => handleSelectPlan(plan)}
                disabled={isCurrent}
                className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isCurrent
                    ? "cursor-default opacity-60"
                    : "cursor-pointer hover:opacity-90 active:scale-95 shadow-sm"
                }`}
                style={{
                  background: isCurrent ? "var(--bg-secondary)" : "var(--accent)",
                  color: isCurrent ? "var(--text-tertiary)" : "#fff",
                  border: isCurrent ? "1px solid var(--border)" : undefined,
                }}
              >
                {isCurrent ? "Current Plan" : "Switch to Plan"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Switch Confirmation Modal */}
      {modalOpen && selectedPlan && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-3xl p-6 shadow-2xl animate-fadeIn relative"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <h3 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              Switch to {selectedPlan.name}
            </h3>
            <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
              {!hidePricing ? `$${selectedPlan.priceInCents / 100}/month · ` : ""}
              {selectedPlan.classesPerWeek} classes per week
            </p>

            <div
              className="p-4 rounded-2xl mb-5 space-y-2 text-xs leading-relaxed"
              style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            >
              <p>
                To adjust your recurring class schedule or billing cycle, your plan change will take effect immediately or on your next billing cycle.
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                Our support team will adjust your weekly class calendar to accommodate the new frequency.
              </p>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                Cancel
              </button>
              <Link
                href="/dashboard/chat"
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white text-center cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                style={{ background: "var(--accent)" }}
              >
                Confirm with Support →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
