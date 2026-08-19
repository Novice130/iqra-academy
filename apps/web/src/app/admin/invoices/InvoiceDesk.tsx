"use client";

/**
 * Raise an invoice, then chase it.
 *
 * Two halves: a form that posts to /api/admin/invoices, and the ledger under
 * it. The ledger updates in place rather than through router.refresh(),
 * because an admin marking six payments off a bank statement should not wait
 * for a server round trip and a full re-render between each one.
 *
 * Amounts are typed in dollars and sent in cents. The API takes cents so that
 * nothing anywhere near money is a float; the form takes dollars because
 * nobody types 12000 for $120.
 *
 * Inline styles throughout, matching the rest of /admin, which does not use
 * the dashboard's Tailwind theme.
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
  /** Raised by hand here, rather than mirrored from Stripe. */
  manual: boolean;
  dueDate: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PAID: { bg: "#065f46", fg: "#a7f3d0" },
  OPEN: { bg: "#78350f", fg: "#fde68a" },
  OVERDUE: { bg: "#7f1d1d", fg: "#fecaca" },
  DRAFT: { bg: "#1e293b", fg: "#94a3b8" },
  VOID: { bg: "#1e293b", fg: "#94a3b8" },
  UNCOLLECTIBLE: { bg: "#7f1d1d", fg: "#fecaca" },
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
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso));
}

/** "YYYY-MM-DD" → midnight UTC as an ISO instant, which is what the API takes. */
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

  /** Picking a family fills in their plan price, unless a figure was typed. */
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

    // Dollars in, cents out. Math.round rather than a truncation: 70.1 * 100
    // is 7009.999... in binary floating point, and an invoice for $70.09 is a
    // phone call.
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
          id: string; status: string; amountDueCents: number; amountPaidCents: number;
          currency: string; notes: string | null; dueDate: string | null;
          periodStart: string | null; periodEnd: string | null; createdAt: string;
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
          "It stays on the ledger, marked void. Use this for one raised in error."
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

  const input: React.CSSProperties = {
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#e2e8f0",
    borderRadius: "8px",
    padding: "9px 12px",
    fontSize: "14px",
    width: "100%",
  };
  const label: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#94a3b8",
    marginBottom: "6px",
  };
  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#94a3b8",
    borderBottom: "1px solid #334155",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "12px",
    borderBottom: "1px solid #1e293b",
    fontSize: "14px",
    verticalAlign: "middle",
  };
  const action: React.CSSProperties = {
    padding: "5px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
  };

  return (
    <div>
      {message && (
        <div
          style={{
            marginBottom: "16px",
            padding: "11px 14px",
            borderRadius: "8px",
            fontSize: "14px",
            background: message.bad ? "#7f1d1d" : "#065f46",
            color: message.bad ? "#fecaca" : "#a7f3d0",
          }}
        >
          {message.text}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {[
          { label: "Outstanding", value: money(outstanding, "usd") },
          { label: "Collected", value: money(collected, "usd") },
          { label: "Invoices", value: String(rows.length) },
        ].map((s) => (
          <div key={s.label} style={{ background: "#1e293b", borderRadius: "12px", padding: "18px" }}>
            <div style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {s.label}
            </div>
            <div style={{ fontSize: "26px", fontWeight: 700, marginTop: "6px" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <form
        onSubmit={raise}
        style={{
          background: "#1e293b",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "28px",
        }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 700 }}>Raise an invoice</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
          }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label} htmlFor="inv-family">Family</label>
            <select
              id="inv-family"
              value={userId}
              onChange={(e) => pickFamily(e.target.value)}
              style={input}
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
            <label style={label} htmlFor="inv-amount">Amount (USD)</label>
            <input
              id="inv-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={selected?.priceInCents ? (selected.priceInCents / 100).toFixed(2) : "120.00"}
              style={input}
            />
          </div>
          <div>
            <label style={label} htmlFor="inv-start">Period from</label>
            <input id="inv-start" type="date" value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="inv-end">Period to</label>
            <input id="inv-end" type="date" value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="inv-due">Due</label>
            <input id="inv-due" type="date" value={dueDate}
              onChange={(e) => setDueDate(e.target.value)} style={input} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label} htmlFor="inv-notes">Note on the invoice (optional)</label>
            <input
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. two weeks off for Eid already deducted"
              style={input}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={label} htmlFor="inv-payurl">Payment link (optional)</label>
            <input
              id="inv-payurl"
              value={payUrl}
              onChange={(e) => setPayUrl(e.target.value)}
              placeholder="https://…  — leave blank and the email says to reply for details"
              style={input}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "16px",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
            Email it to the family now
          </label>
          <button
            type="submit"
            disabled={saving}
            style={{
              background: saving ? "#334155" : "#10b981",
              color: "#04211a",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Raising…" : send ? "Raise and send" : "Raise without sending"}
          </button>
        </div>
      </form>

      <div style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...input, width: "auto" }}
          aria-label="Filter by status"
        >
          <option value="">All ({rows.length})</option>
          {Object.keys(STATUS_COLORS).map((s) => (
            <option key={s} value={s}>
              {s} ({rows.filter((r) => r.status === s).length})
            </option>
          ))}
        </select>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
          <thead>
            <tr>
              <th style={th}>Family</th>
              <th style={th}>Period</th>
              <th style={th}>Amount</th>
              <th style={th}>Status</th>
              <th style={th}>Due</th>
              <th style={th}>Note</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const c = STATUS_COLORS[r.status] ?? STATUS_COLORS.DRAFT;
              const settled = r.status === "PAID" || r.status === "VOID";
              return (
                <tr key={r.id}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{r.userName || "—"}</div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>{r.userEmail}</div>
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: "#cbd5e1" }}>
                    {day(r.periodStart)} → {day(r.periodEnd)}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 600 }}>
                    {money(r.amountDueCents, r.currency)}
                    {r.amountPaidCents > 0 && r.amountPaidCents < r.amountDueCents && (
                      <div style={{ fontSize: "12px", color: "#fde68a" }}>
                        {money(r.amountPaidCents, r.currency)} paid
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        background: c.bg,
                        color: c.fg,
                        borderRadius: "999px",
                        padding: "3px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      {r.status}
                    </span>
                    {!r.manual && (
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Stripe</div>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: "#cbd5e1" }}>{day(r.dueDate)}</td>
                  <td style={{ ...td, color: "#94a3b8", maxWidth: "220px" }}>{r.notes || "—"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                    {!settled && (
                      <div style={{ display: "inline-flex", gap: "6px" }}>
                        <button
                          onClick={() => setStatus(r, "PAID")}
                          disabled={busyId === r.id}
                          style={{ ...action, background: "#065f46", color: "#a7f3d0", border: "1px solid #047857" }}
                        >
                          {busyId === r.id ? "…" : "Mark paid"}
                        </button>
                        <button
                          onClick={() => setStatus(r, "VOID")}
                          disabled={busyId === r.id}
                          style={action}
                        >
                          Void
                        </button>
                      </div>
                    )}
                    {r.status === "PAID" && (
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                        paid {day(r.paidAt)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: "36px" }}>
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
