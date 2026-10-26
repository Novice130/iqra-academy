"use client";

/**
 * @fileoverview The "Manage" drawer under one manual subscription row:
 * pause/resume, change plan, extend, cancel. Each is one PATCH to
 * api/admin/subscriptions/[id]; cancelling asks for a second click first.
 */

import { useState } from "react";
import { dayKeyInZone, useViewerTimeZone } from "@/components/LocalTime";
import type { PlanRow, SubscriptionRow } from "@/lib/admin-subscriptions";
import { btn, input } from "../_components/ui";
import { addMonthsToDayKey, errorText, noticeClass, sendJson } from "./shared";

type Op =
  | { op: "pause" }
  | { op: "resume" }
  | { op: "keep" }
  | { op: "change_plan"; planId: string }
  | { op: "extend"; untilDay: string; timeZone?: string }
  | { op: "cancel"; when: "now" | "period_end" };

export default function SubscriptionActions({
  row,
  plans,
  onDone,
}: {
  row: SubscriptionRow;
  plans: PlanRow[];
  onDone: (text: string) => void;
}) {
  const tz = useViewerTimeZone();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState("");
  const [untilDay, setUntilDay] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<"now" | "period_end" | null>(null);

  const endKey = tz ? dayKeyInZone(row.periodEnd, tz) : "";
  const extendTo = untilDay ?? (endKey ? addMonthsToDayKey(endKey, 1) : "");
  // A SUPER_ADMIN's plan list spans schools; only this family's school's plans apply.
  const orgId = plans.find((p) => p.id === row.planId)?.orgId;
  const others = plans.filter((p) => p.isActive && p.id !== row.planId && p.orgId === orgId);

  async function run(key: string, body: Op, success: string) {
    setBusy(key);
    setError(null);
    try {
      await sendJson(`/api/admin/subscriptions/${row.id}`, "PATCH", body, "That change didn't go through.");
      setConfirmCancel(null);
      onDone(success);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const who = row.familyName || row.familyEmail;
  const sectionCls = "space-y-2 min-w-0";
  const headCls = "text-xs font-semibold text-[var(--text-secondary)]";

  return (
    <div className="space-y-4">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <section className={sectionCls} aria-label="Pause or resume">
          <h3 className={headCls}>{row.status === "PAUSED" ? "Paused" : "Pause"}</h3>
          <p className="text-xs text-[var(--text-tertiary)]">
            {row.status === "PAUSED"
              ? "No classes can be booked. Resuming does not add the paused time back; extend the period for that."
              : "Stops new bookings. The period keeps running."}
          </p>
          {row.status === "PAUSED" ? (
            <button type="button" className={btn.secondary} disabled={!!busy} onClick={() => run("resume", { op: "resume" }, `${who}'s plan is active again.`)}>
              {busy === "resume" ? "Resuming…" : "Resume"}
            </button>
          ) : (
            <button type="button" className={btn.secondary} disabled={!!busy} onClick={() => run("pause", { op: "pause" }, `${who}'s plan is paused.`)}>
              {busy === "pause" ? "Pausing…" : "Pause"}
            </button>
          )}
        </section>

        <section className={sectionCls} aria-label="Change plan">
          <label htmlFor={`sa-plan-${row.id}`} className={headCls}>Change plan</label>
          <select id={`sa-plan-${row.id}`} value={planId} onChange={(e) => setPlanId(e.target.value)} className={input}>
            <option value="">Choose a plan…</option>
            {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            type="button"
            className={btn.secondary}
            disabled={!planId || !!busy}
            onClick={() => run("plan", { op: "change_plan", planId }, `${who} moved to ${others.find((p) => p.id === planId)?.name ?? "the new plan"}.`)}
          >
            {busy === "plan" ? "Changing…" : "Change plan"}
          </button>
        </section>

        <section className={sectionCls} aria-label="Extend period">
          <label htmlFor={`sa-until-${row.id}`} className={headCls}>Extend period to</label>
          <input id={`sa-until-${row.id}`} type="date" value={extendTo} min={endKey || undefined} onChange={(e) => setUntilDay(e.target.value)} className={input} />
          <button
            type="button"
            className={btn.secondary}
            disabled={!extendTo || !!busy}
            onClick={() => run("extend", { op: "extend", untilDay: extendTo, ...(tz ? { timeZone: tz } : {}) }, `${who}'s period now runs to ${extendTo}.`)}
          >
            {busy === "extend" ? "Extending…" : "Extend"}
          </button>
        </section>

        <section className={sectionCls} aria-label="End subscription">
          <h3 className={headCls}>End</h3>
          {row.cancelAtPeriodEnd ? (
            <>
              <p className="text-xs text-[var(--text-tertiary)]">Set to end when this period does.</p>
              <button type="button" className={btn.secondary} disabled={!!busy} onClick={() => run("keep", { op: "keep" }, `${who}'s plan will carry on.`)}>
                {busy === "keep" ? "Saving…" : "Keep subscription"}
              </button>
            </>
          ) : confirmCancel ? (
            <div role="group" aria-label="Confirm cancellation" className="space-y-2">
              <p className="text-xs font-medium text-[var(--color-danger)]">
                {confirmCancel === "now"
                  ? "End it today? The family can't book from now on."
                  : "End it when this period does? Booking works until then."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btn.danger}
                  disabled={!!busy}
                  onClick={() => run("cancel", { op: "cancel", when: confirmCancel }, confirmCancel === "now" ? `${who}'s plan has ended.` : `${who}'s plan will end with this period.`)}
                >
                  {busy === "cancel" ? "Cancelling…" : "Yes, cancel"}
                </button>
                <button type="button" className={btn.ghost} disabled={!!busy} onClick={() => setConfirmCancel(null)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!row.periodOver && (
                <button type="button" className={btn.secondary} onClick={() => setConfirmCancel("period_end")}>At period end</button>
              )}
              <button type="button" className={btn.secondary} onClick={() => setConfirmCancel("now")}>Cancel now</button>
            </div>
          )}
        </section>
      </div>
      {error && <p role="alert" className={noticeClass(true)}>{error}</p>}
    </div>
  );
}
