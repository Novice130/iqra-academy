"use client";

/**
 * @fileoverview The invoice ledger table and its per-row actions.
 *
 * Mark paid is one click: it is the common case and is undone by voiding.
 * Void asks first, inline. Refund opens a small form under the row. Stripe
 * rows can't be refunded here — the table stores no payment reference for
 * them — and say so instead of offering a button that would fail.
 */

import { Fragment, useState } from "react";
import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import { money } from "@/lib/money";
import { Badge, EmptyState, StatusBadge, btn, table } from "../_components/ui";
import RefundForm from "./RefundForm";
import { apiError, type InvoiceRow } from "./shared";
import type { DeskMessage } from "./InvoiceDesk";

type Pending = { id: string; kind: "void" | "refund" } | null;

function When({ iso }: { iso: string | null }) {
  return iso ? <LocalTime iso={iso} mode="date" /> : <>—</>;
}

export default function InvoiceTable({
  rows,
  filtered,
  busy,
  onChanged,
}: {
  rows: InvoiceRow[];
  filtered: boolean;
  busy: boolean;
  onChanged: (msg: DeskMessage) => void;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function setStatus(row: InvoiceRow, status: "PAID" | "VOID") {
    setSavingId(row.id);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: row.id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(data, "That change didn't go through."));
      const who = row.userName || row.userEmail;
      onChanged({ text: status === "PAID" ? `Marked paid: ${who}.` : `Invoice voided: ${who}.`, bad: false });
      setPending(null);
    } catch (err) {
      onChanged({ text: err instanceof Error ? err.message : "Something went wrong.", bad: true });
    } finally {
      setSavingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={filtered ? "No invoices match these filters" : "No invoices yet"}
        body={filtered ? "Try a wider date range or clear the filters." : "Invoices you issue will be listed here."}
      />
    );
  }

  return (
    <div className={table.wrap}>
      <table className={`${table.table} min-w-[820px]`}>
        <thead>
          <tr>
            <th scope="col" className={table.th}>Family</th>
            <th scope="col" className={table.th}>Period</th>
            <th scope="col" className={table.th}>Amount</th>
            <th scope="col" className={table.th}>Status</th>
            <th scope="col" className={table.th}>Due</th>
            <th scope="col" className={`${table.th} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const open = ["OPEN", "OVERDUE", "DRAFT"].includes(r.status);
            const disabled = busy || savingId === r.id;
            const name = r.userName || "Unnamed family";
            const refunding = pending?.id === r.id && pending.kind === "refund";
            const confirmingVoid = pending?.id === r.id && pending.kind === "void";
            return (
              <Fragment key={r.id}>
                <tr className={table.tr}>
                  <td className={table.td}>
                    {r.profileId ? (
                      <Link href={`/admin/students/${r.profileId}`} className="font-semibold hover:text-[var(--accent)] hover:underline">
                        {name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{name}</span>
                    )}
                    <div className="text-xs text-[var(--text-secondary)]">{r.userEmail}</div>
                    {r.notes && (
                      <div className="mt-1 max-w-[18rem] truncate text-xs text-[var(--text-tertiary)]" title={r.notes}>
                        {r.notes}
                      </div>
                    )}
                  </td>
                  <td className={`${table.td} whitespace-nowrap text-[var(--text-secondary)]`}>
                    <When iso={r.periodStart} /> to <When iso={r.periodEnd} />
                  </td>
                  <td className={`${table.td} whitespace-nowrap font-semibold tabular-nums`}>
                    {money(r.amountDueCents, r.currency)}
                    {r.amountPaidCents > 0 && r.amountPaidCents !== r.amountDueCents && (
                      <div className="text-xs font-normal text-[var(--text-secondary)]">
                        {money(r.amountPaidCents, r.currency)} paid
                      </div>
                    )}
                  </td>
                  <td className={table.td}>
                    <div className="flex flex-wrap items-center gap-1">
                      {r.overdue ? <StatusBadge status="OVERDUE" /> : <StatusBadge status={r.status} />}
                      {!r.manual && <Badge>Stripe</Badge>}
                    </div>
                    {r.overdue && r.status === "OPEN" && (
                      <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">Due date passed</div>
                    )}
                  </td>
                  <td className={`${table.td} whitespace-nowrap text-[var(--text-secondary)]`}>
                    <When iso={r.dueDate} />
                    {r.paidAt && r.status === "PAID" && (
                      <div className="text-xs">Paid <When iso={r.paidAt} /></div>
                    )}
                  </td>
                  <td className={`${table.td} text-right`}>
                    <div className="inline-flex flex-wrap justify-end gap-1.5">
                      {confirmingVoid ? (
                        <>
                          <span className="self-center text-xs text-[var(--text-secondary)]">Void this invoice?</span>
                          <button type="button" className={btn.danger + " h-8 px-3 text-xs"} disabled={disabled} onClick={() => setStatus(r, "VOID")}>
                            {savingId === r.id ? "Voiding…" : "Yes, void"}
                          </button>
                          <button type="button" className={btn.ghost} disabled={disabled} onClick={() => setPending(null)}>
                            Keep
                          </button>
                        </>
                      ) : (
                        <>
                          {open && (
                            <button type="button" className={btn.ghost} disabled={disabled} onClick={() => setStatus(r, "PAID")}>
                              {savingId === r.id ? "Saving…" : "Mark paid"}
                            </button>
                          )}
                          {open && r.amountPaidCents === 0 && (
                            <button type="button" className={btn.ghost} disabled={disabled} onClick={() => setPending({ id: r.id, kind: "void" })}>
                              Void
                            </button>
                          )}
                          {r.amountPaidCents > 0 && r.manual && (
                            <button
                              type="button"
                              className={btn.ghost}
                              disabled={disabled}
                              aria-expanded={refunding}
                              onClick={() => setPending(refunding ? null : { id: r.id, kind: "refund" })}
                            >
                              Record refund
                            </button>
                          )}
                          {r.amountPaidCents > 0 && !r.manual && (
                            <span className="self-center text-xs text-[var(--text-tertiary)]" title="This invoice has no stored payment reference. Refund it from the Stripe dashboard.">
                              Refund in Stripe
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {refunding && (
                  <tr>
                    <td colSpan={6} className="px-4 pb-4">
                      <RefundForm
                        row={r}
                        onCancel={() => setPending(null)}
                        onDone={(msg) => {
                          setPending(null);
                          onChanged(msg);
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
