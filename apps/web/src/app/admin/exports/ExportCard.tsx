"use client";

/**
 * @fileoverview One export dataset: description, optional date range and
 * status, and a Download button.
 *
 * The file is fetched rather than linked so the button can show that it is
 * working and an error (a bad range, a lapsed session) appears on the card
 * instead of as a page of JSON in a new tab. The range is calendar days in
 * the viewer's zone, which is sent along and also used for the times inside
 * the file.
 */

import { useEffect, useState } from "react";
import { dayKeyInZone, useViewerTimeZone } from "@/components/LocalTime";
import { btn, input, label } from "../_components/ui";
import { apiError, shiftDayKey } from "../invoices/shared";

export interface ExportDataset {
  type: "students" | "users" | "sessions" | "attendance" | "invoices";
  title: string;
  description: string;
  ranged?: boolean;
  statuses?: boolean;
}

const INVOICE_STATUSES = ["OPEN", "OVERDUE", "PAID", "VOID", "DRAFT", "UNCOLLECTIBLE"];

/** The server's own name for the file, from Content-Disposition. */
function filenameOf(res: Response, fallback: string): string {
  const match = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "");
  return match?.[1] ?? fallback;
}

export default function ExportCard({ dataset }: { dataset: ExportDataset }) {
  const tz = useViewerTimeZone();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const id = `export-${dataset.type}`;

  // Last 30 days, once the viewer's "today" is known.
  useEffect(() => {
    if (!dataset.ranged) return;
    const today = dayKeyInZone(new Date(), tz || undefined);
    if (!today) return;
    setTo((v) => v || today);
    setFrom((v) => v || shiftDayKey(today, -29));
  }, [tz, dataset.ranged]);

  const rangeError = dataset.ranged && from && to && from > to ? "The start date is after the end date." : null;

  async function download() {
    setError(null);
    setDone(null);
    const params = new URLSearchParams({ type: dataset.type });
    if (tz) params.set("tz", tz);
    if (dataset.ranged) {
      if (!from || !to) return setError("Pick both dates.");
      params.set("from", from);
      params.set("to", to);
    }
    if (status) params.set("status", status);

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/exports?${params}`);
      if (!res.ok) throw new Error(apiError(await res.json().catch(() => ({})), "The export failed."));
      const name = filenameOf(res, `${dataset.type}.csv`);
      const rows = res.headers.get("X-Export-Rows");
      const truncated = res.headers.get("X-Export-Truncated") === "true";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDone(
        truncated
          ? `Downloaded the first ${rows} rows only. Narrow the range for the rest.`
          : `Downloaded ${rows ?? ""} row${rows === "1" ? "" : "s"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The export failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <div>
        <h2 id={`${id}-title`} className="text-sm font-semibold text-[var(--text-primary)]">{dataset.title}</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{dataset.description}</p>
      </div>

      {dataset.ranged && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${id}-from`} className={label}>From</label>
            <input id={`${id}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor={`${id}-to`} className={label}>To</label>
            <input id={`${id}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
          </div>
        </div>
      )}

      {dataset.statuses && (
        <div>
          <label htmlFor={`${id}-status`} className={label}>Status</label>
          <select id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
            <option value="">All statuses</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
      )}

      {(rangeError || error) && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">Error: {rangeError || error}</p>
      )}
      {done && !error && <p role="status" className="text-sm text-[var(--text-secondary)]">{done}</p>}

      <div className="mt-auto">
        <button type="button" onClick={download} disabled={loading || !!rangeError} className={btn.secondary}>
          {loading ? "Preparing…" : "Download CSV"}
        </button>
      </div>
    </section>
  );
}
