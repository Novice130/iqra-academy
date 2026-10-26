"use client";

/**
 * @fileoverview The interactive half of /admin/invoices: the issue form, the
 * ledger table, and the message line between them.
 *
 * Rows come from the server on every render. After a change this calls
 * router.refresh() instead of patching local state, so the stat cards, the
 * filter and the row all agree with the database — a local copy used to
 * drift from the totals the moment anything was marked paid.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, btn } from "../_components/ui";
import IssueInvoiceForm from "./IssueInvoiceForm";
import InvoiceTable from "./InvoiceTable";
import type { FamilyOption, InvoiceRow } from "./shared";

export interface DeskMessage {
  text: string;
  bad: boolean;
}

export default function InvoiceDesk({
  families,
  invoices,
  prefillUserId,
  prefillMissing,
  limitHit,
  filtered,
}: {
  families: FamilyOption[];
  invoices: InvoiceRow[];
  prefillUserId: string;
  prefillMissing: boolean;
  limitHit: boolean;
  filtered: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [formOpen, setFormOpen] = useState(!!prefillUserId);
  const [message, setMessage] = useState<DeskMessage | null>(
    prefillMissing ? { text: "That family wasn't found in this school, so nothing was picked.", bad: true } : null
  );

  function changed(msg: DeskMessage) {
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

      {formOpen ? (
        <Panel
          title="Issue invoice"
          description="Leave the amount blank to charge the family's plan price."
          actions={
            <button type="button" className={btn.ghost} onClick={() => setFormOpen(false)}>
              Close
            </button>
          }
        >
          <IssueInvoiceForm
            families={families}
            initialUserId={prefillUserId}
            onDone={(msg) => {
              changed(msg);
              if (!msg.bad) setFormOpen(false);
            }}
          />
        </Panel>
      ) : (
        <div className="flex justify-end">
          <button type="button" className={btn.primary} onClick={() => setFormOpen(true)}>
            Issue invoice
          </button>
        </div>
      )}

      <Panel
        title="Ledger"
        description={
          limitHit
            ? "Showing the newest 300 matching invoices. Narrow the filters, or export the full list."
            : `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}${filtered ? " match these filters" : ""}.`
        }
        actions={refreshing ? <span className="text-xs text-[var(--text-tertiary)]" role="status">Updating…</span> : undefined}
        flush
      >
        <InvoiceTable rows={invoices} filtered={filtered} onChanged={changed} busy={refreshing} />
      </Panel>
    </div>
  );
}
