/**
 * @fileoverview Types and small helpers shared by the /admin/invoices server
 * page and its client components. No hooks, no "use client", so both sides
 * can import it.
 */

export interface FamilyOption {
  id: string;
  name: string | null;
  email: string;
  planName: string | null;
  priceInCents: number | null;
  currency: string;
}

export interface InvoiceRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  /** The family's first student profile, for the student 360 link. */
  profileId: string | null;
  status: string;
  /** OVERDUE, or OPEN with its due date behind us. Computed, not stored. */
  overdue: boolean;
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  notes: string | null;
  /** Raised by hand rather than mirrored from Stripe. */
  manual: boolean;
  dueDate: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
}

/**
 * UNPAID is OPEN or OVERDUE whatever the due date: the same set the "Open
 * balance" card adds up. OPEN alone means open and not yet due.
 */
export const STATUS_FILTERS = ["UNPAID", "OPEN", "OVERDUE", "PAID", "VOID", "DRAFT", "UNCOLLECTIBLE"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** The message an API error response carries, whichever shape it came in. */
export function apiError(data: unknown, fallback: string): string {
  const d = (data ?? {}) as { error?: string; message?: string; details?: { message?: string }[] };
  return d.details?.[0]?.message || d.message || d.error || fallback;
}

/** "120" or "120.50" typed in a box → cents, or null when it isn't money. */
export function dollarsToCents(text: string): number | null {
  const trimmed = text.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  return cents > 0 ? cents : null;
}

/** YYYY-MM-DD plus or minus whole days, on the calendar (no zone involved). */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
