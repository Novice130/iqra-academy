"use client";

/**
 * @fileoverview "New coupon" form. Everything here maps onto what the coupon
 * table stores and createStripeCoupon sends: percent or fixed amount, the
 * coupon's own duration, a redemption cap and an expiry day (read in the
 * viewer's zone, last minute of that day).
 */

import { useState } from "react";
import { useViewerTimeZone } from "@/components/LocalTime";
import { btn, humanize, input, label } from "../_components/ui";
import { apiError, dollarsToCents } from "../invoices/shared";
import type { CouponMessage } from "./CouponDesk";

const TIERS = ["INDIVIDUAL", "GROUP", "SIBLINGS", "FREE"] as const;

export default function CreateCouponForm({
  existingCodes,
  onDone,
}: {
  existingCodes: string[];
  onDone: (msg: CouponMessage) => void;
}) {
  const tz = useViewerTimeZone();
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [duration, setDuration] = useState<"once" | "repeating" | "forever">("once");
  const [months, setMonths] = useState("3");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expires, setExpires] = useState("");
  const [tiers, setTiers] = useState<string[]>(["INDIVIDUAL", "GROUP", "SIBLINGS"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTier(t: string) {
    setTiers((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(normalized)) return setError("Codes are 3 to 20 letters, digits or dashes.");
    if (existingCodes.includes(normalized)) return setError(`There's already a coupon called ${normalized}.`);

    let discount: Record<string, number>;
    if (kind === "percent") {
      const pct = Number(value);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100) return setError("Percent off is a whole number from 1 to 100.");
      discount = { discountPercent: pct };
    } else {
      const cents = dollarsToCents(value);
      if (cents === null) return setError("Enter the amount off as a number, like 10 or 10.50.");
      discount = { discountAmountCents: cents };
    }
    const monthCount = Number(months);
    if (duration === "repeating" && (!Number.isInteger(monthCount) || monthCount < 1 || monthCount > 36)) {
      return setError("A repeating coupon lasts 1 to 36 months.");
    }
    const cap = maxRedemptions.trim() === "" ? undefined : Number(maxRedemptions);
    if (cap !== undefined && (!Number.isInteger(cap) || cap < 1)) return setError("Max uses is a whole number, or blank for no limit.");
    if (tiers.length === 0) return setError("Pick at least one plan.");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalized,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...discount,
          duration,
          ...(duration === "repeating" ? { durationInMonths: monthCount } : {}),
          ...(cap !== undefined ? { maxRedemptions: cap } : {}),
          ...(expires ? { validUntilDay: expires, ...(tz ? { timeZone: tz } : {}) } : {}),
          applicableTiers: tiers,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(data, "That coupon wasn't created."));
      onDone({ text: `Coupon ${normalized} created.`, bad: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="cc-code" className={label}>Code</label>
          <input id="cc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="RAMADAN25" className={`${input} font-mono`} autoComplete="off" />
        </div>
        <div className="sm:col-span-1 lg:col-span-3">
          <label htmlFor="cc-desc" className={label}>Description (optional)</label>
          <input id="cc-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Ramadan family discount" className={input} />
        </div>
        <fieldset>
          <legend className={label}>Discount type</legend>
          <div className="flex gap-4 pt-1 text-sm">
            {(["percent", "amount"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="radio" name="cc-kind" checked={kind === k} onChange={() => setKind(k)} />
                {k === "percent" ? "Percent" : "Fixed amount (USD)"}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="cc-value" className={label}>{kind === "percent" ? "Percent off" : "Amount off"}</label>
          <input id="cc-value" value={value} onChange={(e) => setValue(e.target.value)} inputMode={kind === "percent" ? "numeric" : "decimal"} placeholder={kind === "percent" ? "25" : "10.00"} className={input} />
        </div>
        <div>
          <label htmlFor="cc-duration" className={label}>Applies for</label>
          <select id="cc-duration" value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)} className={input}>
            <option value="once">The first invoice only</option>
            <option value="repeating">A number of months</option>
            <option value="forever">Every invoice</option>
          </select>
        </div>
        {duration === "repeating" && (
          <div>
            <label htmlFor="cc-months" className={label}>Months</label>
            <input id="cc-months" value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" className={input} />
          </div>
        )}
        <div>
          <label htmlFor="cc-max" className={label}>Max uses (optional)</label>
          <input id="cc-max" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} inputMode="numeric" placeholder="No limit" className={input} />
        </div>
        <div>
          <label htmlFor="cc-expires" className={label}>Last day to use (optional)</label>
          <input id="cc-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={input} />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className={label}>Plans it applies to</legend>
          <div className="flex flex-wrap gap-4 pt-1 text-sm">
            {TIERS.map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input type="checkbox" checked={tiers.includes(t)} onChange={() => toggleTier(t)} />
                {humanize(t)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          Error: {error}
        </p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className={btn.primary}>
          {saving ? "Creating…" : "Create coupon"}
        </button>
      </div>
    </form>
  );
}
