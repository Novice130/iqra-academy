"use client";

/**
 * @fileoverview Interactive half of /admin/coupons: the create form and the
 * coupon table, with one message line. Changes re-read the server with
 * router.refresh() so the counts above stay true.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, btn } from "../_components/ui";
import CreateCouponForm from "./CreateCouponForm";
import CouponTable from "./CouponTable";
import type { CouponRow } from "./shared";

export interface CouponMessage {
  text: string;
  bad: boolean;
}

export default function CouponDesk({ coupons, stripeReady }: { coupons: CouponRow[]; stripeReady: boolean }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState<CouponMessage | null>(null);

  function changed(msg: CouponMessage) {
    setMessage(msg);
    if (!msg.bad) startRefresh(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          role={message.bad ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            message.bad
              ? "border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
              : "border-[var(--color-success)]/25 bg-[var(--color-success)]/10 text-[var(--color-success)]"
          }`}
        >
          {message.bad ? "Error: " : ""}
          {message.text}
        </div>
      )}

      {formOpen && stripeReady ? (
        <Panel
          title="New coupon"
          description="Created in Stripe first, then saved here."
          actions={
            <button type="button" className={btn.ghost} onClick={() => setFormOpen(false)}>
              Close
            </button>
          }
        >
          <CreateCouponForm
            existingCodes={coupons.map((c) => c.code)}
            onDone={(msg) => {
              changed(msg);
              if (!msg.bad) setFormOpen(false);
            }}
          />
        </Panel>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            className={btn.primary}
            disabled={!stripeReady}
            aria-describedby={stripeReady ? undefined : "coupon-disabled-why"}
            onClick={() => setFormOpen(true)}
          >
            New coupon
          </button>
          {!stripeReady && (
            <p id="coupon-disabled-why" className="text-xs text-[var(--text-tertiary)]">
              Needs Stripe to be configured.
            </p>
          )}
        </div>
      )}

      <Panel
        title="All coupons"
        actions={refreshing ? <span role="status" className="text-xs text-[var(--text-tertiary)]">Updating…</span> : undefined}
        flush
      >
        <CouponTable coupons={coupons} stripeReady={stripeReady} busy={refreshing} onChanged={changed} />
      </Panel>
    </div>
  );
}
