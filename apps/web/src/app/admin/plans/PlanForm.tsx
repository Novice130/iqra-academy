"use client";

/**
 * @fileoverview Create or edit one plan. Sends only the fields that changed
 * on an edit, so a refused field (tier with families on it, price on a
 * Stripe-linked plan) isn't re-sent just because the form holds it.
 */

import { useState } from "react";
import type { PlanRow } from "@/lib/admin-subscriptions";
import { btn, humanize, input, label } from "../_components/ui";
import { SESSION_TYPES, TIERS, TIER_HINT, errorText, noticeClass, sendJson } from "./shared";

/** "70" or "70.50" → cents; "0" is allowed (free plans). */
function toCents(text: string): number | null {
  const t = text.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export default function PlanForm({
  plan,
  onDone,
  onCancel,
}: {
  plan?: PlanRow;
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [tier, setTier] = useState(plan?.tier ?? "INDIVIDUAL");
  const [sessionType, setSessionType] = useState(plan?.sessionType ?? "INDIVIDUAL");
  const [price, setPrice] = useState(plan ? (plan.priceInCents / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState(plan?.currency ?? "usd");
  const [perWeek, setPerWeek] = useState(String(plan?.classesPerWeek ?? 4));
  const [maxStudents, setMaxStudents] = useState(String(plan?.maxStudents ?? 1));
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = plan?.id ?? "new";
  const priceLocked = !!plan?.stripeLinked;
  const tierLocked = !!plan && plan.liveCount > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = toCents(price);
    if (!name.trim()) return setError("Give the plan a name.");
    if (cents === null) return setError("Enter the price as a number, like 70 or 70.50.");
    const classesPerWeek = Number(perWeek);
    const students = Number(maxStudents);
    if (!Number.isInteger(classesPerWeek) || classesPerWeek < 0 || classesPerWeek > 14)
      return setError("Classes per week must be a whole number from 0 to 14.");
    if (!Number.isInteger(students) || students < 1 || students > 20)
      return setError("Students must be a whole number from 1 to 20.");

    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      tier,
      sessionType,
      priceInCents: cents,
      currency: currency.trim().toLowerCase(),
      classesPerWeek,
      maxStudents: students,
      isActive,
    };
    if (plan) {
      const before: Record<string, unknown> = { ...plan, description: plan.description ?? "" };
      for (const k of Object.keys(body)) if (body[k] === before[k]) delete body[k];
      if (Object.keys(body).length === 0) return onCancel();
    }

    setSaving(true);
    try {
      await sendJson(plan ? `/api/admin/plans/${plan.id}` : "/api/admin/plans", plan ? "PATCH" : "POST", body, "The plan wasn't saved.");
      onDone(plan ? `Saved "${name.trim()}".` : `Created "${name.trim()}".`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label={plan ? `Edit ${plan.name}` : "New plan"}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor={`pf-name-${id}`} className={label}>Name</label>
          <input id={`pf-name-${id}`} value={name} onChange={(e) => setName(e.target.value)} className={input} maxLength={80} required />
        </div>
        <div>
          <label htmlFor={`pf-tier-${id}`} className={label}>Tier</label>
          <select id={`pf-tier-${id}`} value={tier} onChange={(e) => setTier(e.target.value)} className={input} disabled={tierLocked} aria-describedby={`pf-tier-hint-${id}`}>
            {TIERS.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </select>
          <p id={`pf-tier-hint-${id}`} className="mt-1 text-xs text-[var(--text-tertiary)]">
            {tierLocked ? "Locked while families are on this plan." : TIER_HINT[tier]}
          </p>
        </div>
        <div>
          <label htmlFor={`pf-type-${id}`} className={label}>Class type</label>
          <select id={`pf-type-${id}`} value={sessionType} onChange={(e) => setSessionType(e.target.value)} className={input}>
            {SESSION_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`pf-price-${id}`} className={label}>Price per month</label>
          <input id={`pf-price-${id}`} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="70.00" className={input} disabled={priceLocked} aria-describedby={`pf-price-hint-${id}`} />
          <p id={`pf-price-hint-${id}`} className="mt-1 text-xs text-[var(--text-tertiary)]">
            {priceLocked ? "Set in Stripe for this plan." : "Used when an invoice is left blank."}
          </p>
        </div>
        <div>
          <label htmlFor={`pf-cur-${id}`} className={label}>Currency</label>
          <input id={`pf-cur-${id}`} value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className={`${input} uppercase`} disabled={priceLocked} />
        </div>
        <div>
          <label htmlFor={`pf-week-${id}`} className={label}>Classes per week</label>
          <input id={`pf-week-${id}`} type="number" min={0} max={14} value={perWeek} onChange={(e) => setPerWeek(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor={`pf-max-${id}`} className={label}>Students covered</label>
          <input id={`pf-max-${id}`} type="number" min={1} max={20} value={maxStudents} onChange={(e) => setMaxStudents(e.target.value)} className={input} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor={`pf-desc-${id}`} className={label}>Description</label>
          <input id={`pf-desc-${id}`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className={input} />
        </div>
        <label className="flex items-center gap-2 self-end h-9 text-sm text-[var(--text-primary)]">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
          Offered to new families
        </label>
      </div>
      {error && <p role="alert" className={noticeClass(true)}>{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn.primary} disabled={saving}>
          {saving ? "Saving…" : plan ? "Save plan" : "Create plan"}
        </button>
        <button type="button" className={btn.secondary} onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
