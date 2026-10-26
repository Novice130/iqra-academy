"use client";

/**
 * @fileoverview Coupon list with an inline-confirmed Deactivate.
 *
 * Deactivating a Stripe-backed coupon deletes it in Stripe, which can't be
 * undone, so the confirm step says that in words.
 */

import { useState } from "react";
import LocalTime from "@/components/LocalTime";
import { Badge, EmptyState, btn, humanize, table, type Tone } from "../_components/ui";
import { apiError } from "../invoices/shared";
import { couponState, discountLabel, durationLabel, type CouponRow, type CouponState } from "./shared";
import type { CouponMessage } from "./CouponDesk";

const STATE: Record<CouponState, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Deactivated", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "warning" },
  USED_UP: { label: "Used up", tone: "warning" },
};

export default function CouponTable({
  coupons,
  stripeReady,
  busy,
  onChanged,
}: {
  coupons: CouponRow[];
  stripeReady: boolean;
  busy: boolean;
  onChanged: (msg: CouponMessage) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  async function deactivate(c: CouponRow) {
    setSavingId(c.id);
    try {
      const res = await fetch(`/api/admin/coupons/${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(data, "That coupon wasn't deactivated."));
      setConfirming(null);
      onChanged({ text: `${c.code} is deactivated and can't be used again.`, bad: false });
    } catch (err) {
      onChanged({ text: err instanceof Error ? err.message : "Something went wrong.", bad: true });
    } finally {
      setSavingId(null);
    }
  }

  if (coupons.length === 0) {
    return (
      <EmptyState
        title="No coupons yet"
        body={stripeReady ? "Create one with New coupon." : "Coupons can be created once Stripe is configured."}
      />
    );
  }

  return (
    <div className={table.wrap}>
      <table className={`${table.table} min-w-[760px]`}>
        <thead>
          <tr>
            <th scope="col" className={table.th}>Code</th>
            <th scope="col" className={table.th}>Discount</th>
            <th scope="col" className={table.th}>Plans</th>
            <th scope="col" className={table.th}>Used</th>
            <th scope="col" className={table.th}>Expires</th>
            <th scope="col" className={table.th}>Status</th>
            <th scope="col" className={`${table.th} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((c) => {
            const state = couponState(c, now);
            const blocked = c.inStripe && !stripeReady;
            return (
              <tr key={c.id} className={table.tr}>
                <td className={table.td}>
                  <span className="font-mono font-semibold">{c.code}</span>
                  {c.description && <div className="text-xs text-[var(--text-secondary)]">{c.description}</div>}
                </td>
                <td className={`${table.td} whitespace-nowrap`}>
                  {discountLabel(c)}
                  <div className="text-xs text-[var(--text-secondary)]">{durationLabel(c)}</div>
                </td>
                <td className={`${table.td} text-xs text-[var(--text-secondary)]`}>
                  {c.applicableTiers.length ? c.applicableTiers.map(humanize).join(", ") : "Any"}
                </td>
                <td className={`${table.td} tabular-nums whitespace-nowrap`}>
                  {c.redemptions}
                  {c.maxRedemptions !== null && <span className="text-[var(--text-secondary)]"> of {c.maxRedemptions}</span>}
                </td>
                <td className={`${table.td} whitespace-nowrap text-[var(--text-secondary)]`}>
                  {c.validUntil ? <LocalTime iso={c.validUntil} mode="date" /> : "Never"}
                </td>
                <td className={table.td}>
                  <Badge tone={STATE[state].tone}>{STATE[state].label}</Badge>
                </td>
                <td className={`${table.td} text-right`}>
                  {!c.isActive ? null : confirming === c.id ? (
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {c.inStripe ? "Deletes it in Stripe. Can't be undone." : "Can't be undone."}
                      </span>
                      <button type="button" className={`${btn.danger} h-8 px-3 text-xs`} disabled={savingId === c.id || busy} onClick={() => deactivate(c)}>
                        {savingId === c.id ? "Deactivating…" : "Yes, deactivate"}
                      </button>
                      <button type="button" className={btn.ghost} disabled={savingId === c.id} onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={btn.ghost}
                      disabled={busy || blocked}
                      title={blocked ? "Stripe isn't configured, so this Stripe coupon can't be retired." : undefined}
                      onClick={() => setConfirming(c.id)}
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
