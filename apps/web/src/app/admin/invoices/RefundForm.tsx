"use client";

/**
 * @fileoverview Inline "Record refund" form for one manual invoice.
 *
 * It records money already sent back by bank transfer or Zelle; it does not
 * move money. The server caps the amount at what the invoice says was paid
 * and a full refund leaves the invoice void (see api/admin/refunds).
 */

import { useState } from "react";
import { money } from "@/lib/money";
import { btn, input, label } from "../_components/ui";
import { apiError, dollarsToCents, type InvoiceRow } from "./shared";
import type { DeskMessage } from "./InvoiceDesk";

export default function RefundForm({
  row,
  onCancel,
  onDone,
}: {
  row: InvoiceRow;
  onCancel: () => void;
  onDone: (msg: DeskMessage) => void;
}) {
  const [amount, setAmount] = useState((row.amountPaidCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = dollarsToCents(amount);
  const ids = { amount: `rf-amount-${row.id}`, reason: `rf-reason-${row.id}` };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cents === null) return setError("Enter the refund as a number, like 40 or 40.50.");
    if (cents > row.amountPaidCents) return setError(`That's more than the ${money(row.amountPaidCents, row.currency)} paid.`);
    if (!reason.trim()) return setError("Say why, for the record.");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: row.id, amountCents: cents, reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(data, "That refund wasn't recorded."));
      onDone({
        text: `Refund of ${money(cents, row.currency)} recorded for ${row.userName || row.userEmail}.`,
        bad: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4" noValidate>
      <p className="text-xs text-[var(--text-secondary)]">
        Records a refund you have already sent back outside the app. It does not move money. Refunding the full{" "}
        {money(row.amountPaidCents, row.currency)} marks the invoice void.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label htmlFor={ids.amount} className={label}>Amount refunded</label>
          <input id={ids.amount} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={input} />
        </div>
        <div>
          <label htmlFor={ids.reason} className={label}>Reason</label>
          <input id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="For example: classes cancelled for Eid week" className={input} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          Error: {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={btn.danger}>
          {saving ? "Recording…" : cents ? `Record refund of ${money(cents, row.currency)}` : "Record refund"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={btn.secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
