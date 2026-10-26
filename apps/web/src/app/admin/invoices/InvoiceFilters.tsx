"use client";

/**
 * @fileoverview Filter bar for /admin/invoices.
 *
 * A plain GET form, so a filtered view is a URL an admin can bookmark or
 * send, and the server does the filtering against the whole ledger rather
 * than the page of rows already loaded. Client-side only for the hidden `tz`
 * field: the date range means the viewer's days, and when the server doesn't
 * know their zone the browser does.
 */

import Link from "next/link";
import { useViewerTimeZone } from "@/components/LocalTime";
import { btn, input, label } from "../_components/ui";
import { STATUS_FILTERS } from "./shared";

const STATUS_LABEL: Record<string, string> = {
  UNPAID: "Unpaid (open or overdue)",
  OPEN: "Open (not yet due)",
  OVERDUE: "Overdue",
  PAID: "Paid",
  VOID: "Void",
  DRAFT: "Draft",
  UNCOLLECTIBLE: "Uncollectible",
};

export default function InvoiceFilters({
  status,
  q,
  from,
  to,
  family,
}: {
  status: string;
  q: string;
  from: string;
  to: string;
  /** The ?userId= family, when it resolved to one. */
  family: { id: string; label: string } | null;
}) {
  const tz = useViewerTimeZone();
  const active = !!(status || q || from || to || family);
  // The same filters without the family, for the chip's remove link.
  const withoutFamily = new URLSearchParams(
    Object.entries({ status, q, from, to }).filter(([, v]) => v) as [string, string][]
  ).toString();

  return (
    // Keyed on the filters so a client navigation (a stat card link) remounts
    // the uncontrolled inputs with the new values instead of keeping the old.
    <form
      key={`${status}|${q}|${from}|${to}|${family?.id ?? ""}`}
      method="get"
      action="/admin/invoices"
      role="search"
      aria-label="Filter invoices"
      className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_1fr_auto] lg:items-end"
    >
      {tz && <input type="hidden" name="tz" value={tz} />}
      {family && <input type="hidden" name="userId" value={family.id} />}
      {family && (
        <div className="sm:col-span-2 lg:col-span-5 flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] py-1 pl-3 pr-1">
            <span>Family: <span className="font-semibold">{family.label}</span></span>
            <Link
              href={`/admin/invoices${withoutFamily ? `?${withoutFamily}` : ""}`}
              className={btn.ghost + " h-6 px-2"}
              aria-label={`Remove the family filter for ${family.label}`}
            >
              Remove
            </Link>
          </span>
        </div>
      )}
      <div>
        <label htmlFor="inv-status" className={label}>Status</label>
        <select id="inv-status" name="status" defaultValue={status} className={input}>
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="inv-q" className={label}>Family name or email</label>
        <input id="inv-q" name="q" type="search" defaultValue={q} placeholder="Search" maxLength={100} className={input} />
      </div>
      <div>
        <label htmlFor="inv-from" className={label}>Issued from</label>
        <input id="inv-from" name="from" type="date" defaultValue={from} className={input} />
      </div>
      <div>
        <label htmlFor="inv-to" className={label}>Issued to</label>
        <input id="inv-to" name="to" type="date" defaultValue={to} className={input} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={btn.primary}>Apply</button>
        {active && (
          <Link href="/admin/invoices" className={btn.secondary}>Clear</Link>
        )}
      </div>
    </form>
  );
}
