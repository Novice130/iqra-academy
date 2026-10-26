"use client";

/**
 * @fileoverview "Issue invoice" form.
 *
 * Dates are calendar days in the viewer's zone and are sent as days, with the
 * zone, so the server decides when "1 October" starts. The old form turned
 * every date into UTC midnight, which is the previous evening in the US and
 * moved the due date a day early for every admin west of Greenwich.
 *
 * Defaults (this month, due in a week) are filled in after mount, once the
 * viewer's zone is known; on the server render "today" would be UTC's.
 */

import { useEffect, useRef, useState } from "react";
import { dayKeyInZone, useViewerTimeZone } from "@/components/LocalTime";
import { money } from "@/lib/money";
import { btn, input, label } from "../_components/ui";
import { apiError, dollarsToCents, shiftDayKey, type FamilyOption } from "./shared";
import type { DeskMessage } from "./InvoiceDesk";

export default function IssueInvoiceForm({
  families,
  initialUserId,
  onDone,
}: {
  families: FamilyOption[];
  initialUserId: string;
  onDone: (msg: DeskMessage) => void;
}) {
  const tz = useViewerTimeZone();
  const [userId, setUserId] = useState(initialUserId);
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [notes, setNotes] = useState("");
  const [payUrl, setPayUrl] = useState("");
  const [send, setSend] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    if (edited.current) return;
    const today = dayKeyInZone(new Date(), tz || undefined);
    if (!today) return;
    const [y, m] = today.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    setPeriodStart(`${today.slice(0, 8)}01`);
    setPeriodEnd(`${today.slice(0, 8)}${String(lastDay).padStart(2, "0")}`);
    setDueDay(shiftDayKey(today, 7));
  }, [tz]);

  const selected = families.find((f) => f.id === userId);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    edited.current = true;
    set(v);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) return setError("Pick a family first.");
    const cents = amount.trim() === "" ? null : dollarsToCents(amount);
    if (amount.trim() !== "" && cents === null) return setError("Enter the amount as a number, like 120 or 120.50.");
    if (cents === null && !selected.priceInCents) return setError("This family has no plan to take a price from. Enter an amount.");
    if (!periodStart || !periodEnd || !dueDay) return setError("Fill in the billing period and due date.");
    if (periodEnd <= periodStart) return setError("The billing period has to end after it starts.");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...(cents !== null ? { amountCents: cents } : {}),
          periodStartDay: periodStart,
          periodEndDay: periodEnd,
          dueDay,
          ...(tz ? { timeZone: tz } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(payUrl.trim() ? { payUrl: payUrl.trim() } : {}),
          send,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(data, "That invoice didn't go through."));
      const who = selected.name || selected.email;
      onDone({
        text: send ? `Invoice issued and emailed to ${selected.email}.` : `Invoice recorded for ${who}. No email was sent.`,
        bad: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <label htmlFor="ii-family" className={label}>Family</label>
          <select id="ii-family" value={userId} onChange={(e) => setUserId(e.target.value)} className={input} required>
            <option value="">Choose a family…</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {(f.name || f.email) + (f.planName ? ` (${f.planName})` : " (no plan)")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ii-amount" className={label}>Amount</label>
          <input
            id="ii-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={selected?.priceInCents ? money(selected.priceInCents, selected.currency) : "120.00"}
            aria-describedby="ii-amount-hint"
            className={input}
          />
          <p id="ii-amount-hint" className="mt-1 text-xs text-[var(--text-tertiary)]">
            {selected?.priceInCents ? `Blank charges the plan price.` : "Required when the family has no plan."}
          </p>
        </div>
        <div>
          <label htmlFor="ii-from" className={label}>Period from</label>
          <input id="ii-from" type="date" value={periodStart} onChange={(e) => touch(setPeriodStart)(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="ii-to" className={label}>Period to</label>
          <input id="ii-to" type="date" value={periodEnd} onChange={(e) => touch(setPeriodEnd)(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="ii-due" className={label}>Due date</label>
          <input id="ii-due" type="date" value={dueDay} onChange={(e) => touch(setDueDay)(e.target.value)} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ii-notes" className={label}>Notes (shown on the email)</label>
          <input id="ii-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="For example: two weeks off deducted" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ii-pay" className={label}>Payment link (optional)</label>
          <input id="ii-pay" type="url" value={payUrl} onChange={(e) => setPayUrl(e.target.value)} placeholder="https://" className={input} />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          Error: {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="h-4 w-4" />
          Email the invoice to the family now
        </label>
        <button type="submit" disabled={saving} className={btn.primary}>
          {saving ? "Issuing…" : send ? "Issue and send" : "Record without sending"}
        </button>
      </div>
    </form>
  );
}
