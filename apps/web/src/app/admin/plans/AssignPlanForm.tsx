"use client";

/**
 * @fileoverview "Assign a plan" — puts a family on a manual (invoiced) plan.
 *
 * The start day is a calendar day in the viewer's zone and is sent with the
 * zone, so the server decides when it begins (same as the invoice form). It
 * defaults to today once the zone is known; on the server render "today"
 * would be UTC's.
 *
 * Families already on a plan are listed but disabled: one live subscription
 * per family, and the fix for "wrong plan" is Change plan on their row.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayKeyInZone, useViewerTimeZone } from "@/components/LocalTime";
import { money } from "@/lib/money";
import type { FamilyOption, PlanRow } from "@/lib/admin-subscriptions";
import { btn, input, label } from "../_components/ui";
import { errorText, noticeClass, sendJson } from "./shared";

const LENGTHS = [1, 2, 3, 6, 12];

export default function AssignPlanForm({
  families,
  plans,
  initialUserId,
}: {
  families: FamilyOption[];
  plans: PlanRow[];
  initialUserId: string;
}) {
  const router = useRouter();
  const tz = useViewerTimeZone();
  const [refreshing, startRefresh] = useTransition();
  const [userId, setUserId] = useState(initialUserId);
  const [planId, setPlanId] = useState("");
  const [startDay, setStartDay] = useState("");
  const [months, setMonths] = useState(1);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    if (edited.current) return;
    const today = dayKeyInZone(new Date(), tz || undefined);
    if (today) setStartDay(today);
  }, [tz]);

  const offered = plans.filter((p) => p.isActive);
  const family = families.find((f) => f.id === userId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!family) return setNotice({ text: "Pick a family.", bad: true });
    if (family.currentPlan) return setNotice({ text: `${family.label} is already on ${family.currentPlan}. Use Change plan on their row below.`, bad: true });
    if (!planId) return setNotice({ text: "Pick a plan.", bad: true });
    if (!startDay) return setNotice({ text: "Pick a start date.", bad: true });
    setSaving(true);
    try {
      await sendJson(
        "/api/admin/subscriptions",
        "POST",
        { userId, planId, startDay, months, ...(tz ? { timeZone: tz } : {}) },
        "The plan wasn't assigned."
      );
      const planName = offered.find((p) => p.id === planId)?.name ?? "the plan";
      setNotice({ text: `${family.label} is now on ${planName}.`, bad: false });
      setUserId("");
      setPlanId("");
      startRefresh(() => router.refresh());
    } catch (err) {
      setNotice({ text: errorText(err), bad: true });
    } finally {
      setSaving(false);
    }
  }

  if (offered.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">No plans are offered. Create one, or reactivate a retired plan, above.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="ap-family" className={label}>Family</label>
          <select id="ap-family" value={userId} onChange={(e) => setUserId(e.target.value)} className={input} required>
            <option value="">Choose a family…</option>
            {families.map((f) => (
              <option key={f.id} value={f.id} disabled={!!f.currentPlan && f.id !== initialUserId}>
                {f.label}{f.currentPlan ? ` (on ${f.currentPlan})` : ""}
              </option>
            ))}
          </select>
          {family?.currentPlan && (
            <p className="mt-1 text-xs text-[var(--color-warning)]">Already on {family.currentPlan}. Change it from the subscriptions list.</p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ap-plan" className={label}>Plan</label>
          <select id="ap-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} className={input} required>
            <option value="">Choose a plan…</option>
            {offered.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}: {money(p.priceInCents, p.currency)}, {p.classesPerWeek}/week, {p.maxStudents} student{p.maxStudents === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ap-start" className={label}>Starts</label>
          <input
            id="ap-start"
            type="date"
            value={startDay}
            onChange={(e) => { edited.current = true; setStartDay(e.target.value); }}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="ap-months" className={label}>First period</label>
          <select id="ap-months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={input}>
            {LENGTHS.map((m) => <option key={m} value={m}>{m} month{m === 1 ? "" : "s"}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 flex items-end">
          <p className="text-xs text-[var(--text-tertiary)]">
            Billed by invoice. This does not raise an invoice; issue one from Invoices.
          </p>
        </div>
      </div>
      {notice && <p role={notice.bad ? "alert" : "status"} className={noticeClass(notice.bad)}>{notice.text}{refreshing ? " Updating…" : ""}</p>}
      <button type="submit" className={btn.primary} disabled={saving || !!family?.currentPlan}>
        {saving ? "Assigning…" : "Assign plan"}
      </button>
    </form>
  );
}
