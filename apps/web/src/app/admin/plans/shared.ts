/**
 * @fileoverview Small helpers shared by the /admin/plans client components.
 * No hooks and no "use client", so either side can import it.
 */

import { apiError } from "../invoices/shared";

export { apiError };

/** Send JSON to an admin route; throws the route's own message on failure. */
export async function sendJson(url: string, method: "POST" | "PATCH", body: unknown, fallback: string): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiError(data, fallback));
  return data;
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

/** Inline result line under a form or row. Status text, never colour alone. */
export const noticeClass = (bad: boolean) =>
  `rounded-xl border px-3 py-2 text-sm font-medium ${
    bad
      ? "border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
      : "border-[var(--color-success)]/25 bg-[var(--color-success)]/10 text-[var(--color-success)]"
  }`;

export const TIERS = ["FREE", "INDIVIDUAL", "GROUP", "SIBLINGS"] as const;
export const SESSION_TYPES = ["INDIVIDUAL", "GROUP", "SIBLINGS", "WEBINAR"] as const;

/** What each tier means since migration 0004 — see planTierEnum in db/schema.ts. */
export const TIER_HINT: Record<string, string> = {
  FREE: "Webinars only",
  INDIVIDUAL: "1 student, shared weekly allowance",
  GROUP: "Family plan, allowance per child",
  SIBLINGS: "Family plan, allowance per child",
};

/**
 * "2026-01-31" plus whole calendar months, clamped to the month's last day
 * ("2026-02-28"). Pure calendar arithmetic, no zone; the API turns the day
 * into an instant in the admin's zone.
 */
export function addMonthsToDayKey(key: string, months: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
