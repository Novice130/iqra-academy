"use client";

/**
 * Invoice Desk (Twenty CRM Style).
 *
 * Provides invoice generation, payment tracking, live metric overview,
 * and ledger management matching Twenty CRM design language.
 */

import { useMemo, useState } from "react";

export interface FamilyOption {
  id: string;
  name: string | null;
  email: string;
  planName: string | null;
  priceInCents: number | null;
  currency: string;
}

export interface InvoiceRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  status: string;
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  notes: string | null;
  manual: boolean;
  dueDate: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  PAID: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/20" },
  OPEN: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
  OVERDUE: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/20" },
  DRAFT: { bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-500/20" },
  VOID: { bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-500/20" },
  UNCOLLECTIBLE: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/20" },
};

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function day(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function toInstant(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function InvoiceDesk({
  families,
  initialInvoices,
}: {
  families: FamilyOption[];
  initialInvoices: InvoiceRow[];
}) {
  const [rows, setRows] = useState(initialInvoices);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [showRaiseForm, setShowRaiseForm] = useState(false);

  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(
    () => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
    [today]
  );
  const monthEnd = useMemo(
    () => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)),
    [today]
  );

  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState(isoDay(monthStart));
  const [periodEnd, setPeriodEnd] = useState(isoDay(monthEnd));
  const [dueDate, setDueDate] = useState(
    isoDay(new Date(today.getTime() + 7 * 86_400_000))
  );
  const [notes, setNotes] = useState("");
  const [payUrl, setPayUrl] = useState("");
  const [send, setSend] = useState(true);

  const selected = families.find((f) => f.id === userId);

  const outstanding = useMemo(
    () =>
      rows
        .filter((r) => ["OPEN", "OVERDUE", "DRAFT"].includes(r.status))
        .reduce((sum, r) => sum + (r.amountDueCents - r.amountPaidCents), 0),
    [rows]
  );
  const collected = useMemo(
    () => rows.filter((r) => r.status === "PAID").reduce((s, r) => s + r.amountPaidCents, 0),
    [rows]
  );

  const visible = useMemo(
    () => (statusFilter ? rows.filter((r) => r.status === statusFilter) : rows),
    [rows, statusFilter]
  );

  function pickFamily(id: string) {
    setUserId(id);
    const family = families.find((f) => f.id === id);
    if (family?.priceInCents && !amount) {
      setAmount((family.priceInCents / 100).toFixed(2));
    }
  }

  async function raise(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      setMessage({ text: "Pick a family first.", bad: true });
      return;
    }

    const dollars = amount.trim() === "" ? null : Number(amount);
    if (dollars !== null && (!Number.isFinite(dollars) || dollars <= 0)) {
      setMessage({ text: "That amount isn't a number.", bad: true });
      return;
    }
    if (dollars === null && !selected?.priceInCents) {
      setMessage({
        text: "This family has no plan to take a price from — type an amount.",
        bad: true,
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...(dollars !== null ? { amountCents: Math.round(dollars * 100) } : {}),
          periodStart: toInstant(periodStart),
          periodEnd: toInstant(periodEnd),
          dueDate: toInstant(dueDate),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(payUrl.trim() ? { payUrl: payUrl.trim() } : {}),
          send,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        invoice?: {
          id: string;
          status: string;
          amountDueCents: number;
          amountPaidCents: number;
          currency: string;
          notes: string | null;
          dueDate: string | null;
          periodStart: string | null;
          periodEnd: string | null;
          createdAt: string;
        };
      };
      if (!res.ok || !data.invoice) {
        throw new Error(data.error || "That invoice didn't go through.");
      }

      const family = families.find((f) => f.id === userId)!;
      setRows((rs) => [
        {
          id: data.invoice!.id,
          userId,
          userName: family.name,
          userEmail: family.email,
          status: data.invoice!.status,
          amountDueCents: data.invoice!.amountDueCents,
          amountPaidCents: data.invoice!.amountPaidCents,
          currency: data.invoice!.currency,
          notes: data.invoice!.notes,
          manual: true,
          dueDate: data.invoice!.dueDate,
          paidAt: null,
          periodStart: data.invoice!.periodStart,
          periodEnd: data.invoice!.periodEnd,
          createdAt: data.invoice!.createdAt,
        },
        ...rs,
      ]);
      setMessage({
        text: send
          ? `Invoice emailed to ${family.email}.`
          : `Invoice recorded for ${family.name || family.email}. No email sent.`,
        bad: false,
      });
      setAmount("");
      setNotes("");
      setPayUrl("");
      setShowRaiseForm(false);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Something went wrong.", bad: true });
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(row: InvoiceRow, status: string) {
    if (status === "VOID") {
      const ok = window.confirm(
        `Void the ${money(row.amountDueCents, row.currency)} invoice for ${row.userName || row.userEmail}?\n\n` +
          "It stays on the ledger, marked void."
      );
      if (!ok) return;
    }

    const previous = { status: row.status, paid: row.amountPaidCents };
    setBusyId(row.id);
    setMessage(null);
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id
          ? {
              ...r,
              status,
              amountPaidCents: status === "PAID" ? r.amountDueCents : r.amountPaidCents,
              paidAt: status === "PAID" ? new Date().toISOString() : null,
            }
          : r
      )
    );

    try {
      const res = await fetch("/api/admin/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: row.id, status }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "That change didn't go through.");
      setMessage({
        text:
          status === "PAID"
            ? `Marked paid — ${row.userName || row.userEmail}.`
            : `Invoice voided — ${row.userName || row.userEmail}.`,
        bad: false,
      });
    } catch (err) {
      setRows((rs) =>
        rs.map((r) =>
          r.id === row.id
            ? { ...r, status: previous.status, amountPaidCents: previous.paid }
            : r
        )
      );
      setMessage({ text: err instanceof Error ? err.message : "Something went wrong.", bad: true });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards (Twenty CRM Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xs">
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Outstanding
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mt-1">
            {money(outstanding, "usd")}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xs">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Collected
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {money(collected, "usd")}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xs">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Total Invoices
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mt-1">
            {rows.length}
          </div>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold border ${
            message.bad
              ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Toolbar & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] self-start overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setStatusFilter("")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              statusFilter === ""
                ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            All ({rows.length})
          </button>
          {["OPEN", "PAID", "OVERDUE", "VOID"].map((s) => {
            const count = rows.filter((r) => r.status === s).length;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  statusFilter === s
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {s} ({count})
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowRaiseForm(!showRaiseForm)}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 shadow-sm transition"
        >
          {showRaiseForm ? "Close Form ✕" : "+ Raise Invoice"}
        </button>
      </div>

      {/* Collapsible Raise Invoice Form */}
      {showRaiseForm && (
        <form
          onSubmit={raise}
          className="p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs space-y-4 animate-fadeIn"
        >
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Raise New Invoice</h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Family
              </label>
              <select
                value={userId}
                onChange={(e) => pickFamily(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)]"
              >
                <option value="">Choose a family…</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {(f.name || f.email) + (f.planName ? ` — ${f.planName}` : " — no plan")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Amount (USD)
              </label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder={selected?.priceInCents ? (selected.priceInCents / 100).toFixed(2) : "120.00"}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Period From
              </label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Period To
              </label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Notes (Optional)
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. two weeks off deducted"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Payment Link (Optional)
              </label>
              <input
                value={payUrl}
                onChange={(e) => setPayUrl(e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={send}
                onChange={(e) => setSend(e.target.checked)}
                className="rounded border-[var(--border)] text-emerald-600 focus:ring-emerald-500"
              />
              Email invoice to family now
            </label>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition disabled:opacity-50"
            >
              {saving ? "Raising…" : send ? "Raise & Send" : "Raise Without Sending"}
            </button>
          </div>
        </form>
      )}

      {/* Twenty CRM Invoice Ledger Table */}
      <div className="rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--bg-primary)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="px-5 py-3.5">Family</th>
                <th className="px-4 py-3.5">Period</th>
                <th className="px-4 py-3.5">Amount</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Due</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs">
              {visible.map((r) => {
                const badge = STATUS_STYLES[r.status] || STATUS_STYLES.DRAFT;
                const settled = r.status === "PAID" || r.status === "VOID";

                return (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-sm text-[var(--text-primary)]">
                        {r.userName || "Unnamed Family"}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                        {r.userEmail}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-[var(--text-secondary)] whitespace-nowrap">
                      {day(r.periodStart)} → {day(r.periodEnd)}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-[var(--text-primary)]">
                      {money(r.amountDueCents, r.currency)}
                      {r.amountPaidCents > 0 && r.amountPaidCents < r.amountDueCents && (
                        <div className="text-[10px] text-amber-500">
                          {money(r.amountPaidCents, r.currency)} paid
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {r.status}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-[var(--text-secondary)] whitespace-nowrap">
                      {day(r.dueDate)}
                    </td>

                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      {!settled && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setStatus(r, "PAID")}
                            disabled={busyId === r.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition disabled:opacity-50"
                          >
                            {busyId === r.id ? "…" : "Mark Paid"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatus(r, "VOID")}
                            disabled={busyId === r.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 transition disabled:opacity-50"
                          >
                            Void
                          </button>
                        </div>
                      )}
                      {r.status === "PAID" && (
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          Paid {day(r.paidAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-[var(--text-secondary)]">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
