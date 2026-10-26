"use client";

/**
 * @fileoverview Add and remove a teacher's time off, from the admin side.
 *
 * Goes through /api/teachers/time-off with `teacherId`, which already lets an
 * admin act for a teacher in their org and publishes the change so slot
 * generation stops offering those hours.
 *
 * The range is typed as wall-clock time in the TEACHER's zone ("away 9 to 5"
 * means their 9 to 5), and converted to instants here, because the API stores
 * instants and deliberately does no zone arithmetic.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import LocalTime, { useViewerTimeZone } from "@/components/LocalTime";
import type { TimeOffItem } from "@/lib/admin-teachers";
import { EmptyState, btn, input, label } from "../../_components/ui";
import { apiMessage } from "../../users/api-message";
import { isValidZone } from "@/lib/zones";

/** Minutes `zone` is ahead of UTC at `instant`. Same method as lib/slots.ts, which is server-only. */
function offsetMinutes(instant: Date, zone: string): number {
  const parts: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  for (const { type, value } of fmt.formatToParts(instant)) parts[type] = value;
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "00" : parts.hour), Number(parts.minute), Number(parts.second)
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** "2026-11-02T09:00" read as a wall clock in `zone`, as an instant. Null if malformed. */
function wallClockToIso(value: string, zone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const guess = new Date(naive - offsetMinutes(new Date(naive), zone) * 60000);
  return new Date(naive - offsetMinutes(guess, zone) * 60000).toISOString();
}

export default function TimeOffManager({
  teacherId,
  teacherZone,
  initial,
}: {
  teacherId: string;
  teacherZone: string | null;
  initial: TimeOffItem[];
}) {
  const router = useRouter();
  const viewerZone = useViewerTimeZone();
  const zone = teacherZone && isValidZone(teacherZone) ? teacherZone : viewerZone || "UTC";
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState({ startsAt: "", endsAt: "", reason: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const startsAt = wallClockToIso(form.startsAt, zone);
    const endsAt = wallClockToIso(form.endsAt, zone);
    if (!startsAt || !endsAt) return setFormError("Choose a start and an end.");
    if (endsAt <= startsAt) return setFormError("The end must be after the start.");

    setSaving(true);
    try {
      const res = await fetch("/api/teachers/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, startsAt, endsAt, reason: form.reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(apiMessage(data, "Could not add time off."));
      const row = data.timeOff;
      setItems((prev) =>
        [...prev, { id: row.id, startsAt: new Date(row.startsAt).toISOString(), endsAt: new Date(row.endsAt).toISOString(), reason: row.reason ?? null }]
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      );
      setForm({ startsAt: "", endsAt: "", reason: "" });
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add time off.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setRowError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/teachers/time-off?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(apiMessage(data, "Could not remove time off."));
      setItems((prev) => prev.filter((i) => i.id !== id));
      setConfirmId(null);
      router.refresh();
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Could not remove time off." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <EmptyState title="No upcoming time off" />
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {items.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <div className="font-medium text-[var(--text-primary)]">
                  <LocalTime iso={t.startsAt} mode="date-time" /> – <LocalTime iso={t.endsAt} mode="date-time" withZone />
                </div>
                <div className="text-xs text-[var(--text-secondary)]">{t.reason || "No reason given"}</div>
                {rowError?.id === t.id && (
                  <p role="alert" className="mt-1 text-xs font-medium text-[var(--color-danger)]">{rowError.message}</p>
                )}
              </div>
              {confirmId === t.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-secondary)]">Remove this time off?</span>
                  <button type="button" className={btn.danger} disabled={deletingId === t.id} onClick={() => remove(t.id)}>
                    {deletingId === t.id ? "Removing…" : "Remove"}
                  </button>
                  <button type="button" className={btn.ghost} disabled={deletingId === t.id} onClick={() => setConfirmId(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button type="button" className={btn.ghost} onClick={() => setConfirmId(t.id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3 rounded-xl border border-[var(--border)] p-3" noValidate>
        <div className="text-sm font-semibold text-[var(--text-primary)]">Add time off</div>
        <p className="text-xs text-[var(--text-secondary)]">
          Times are in the teacher&apos;s zone, {zone}. Classes already booked in the range are not cancelled; move them from each class page.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="to-start" className={label}>From</label>
            <input id="to-start" type="datetime-local" required className={input} value={form.startsAt}
              onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="to-end" className={label}>Until</label>
            <input id="to-end" type="datetime-local" required className={input} value={form.endsAt} min={form.startsAt || undefined}
              onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
          </div>
        </div>
        <div>
          <label htmlFor="to-reason" className={label}>Reason (optional)</label>
          <input id="to-reason" type="text" maxLength={200} className={input} value={form.reason} placeholder="e.g. Travelling for Eid"
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </div>
        {formError && (
          <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">{formError}</p>
        )}
        <button type="submit" className={btn.primary} disabled={saving}>
          {saving ? "Adding…" : "Add time off"}
        </button>
      </form>
    </div>
  );
}
