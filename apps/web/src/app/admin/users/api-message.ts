/**
 * @fileoverview The human-readable message out of an API error body.
 *
 * Routes answer failures in three shapes: `handleApiError` sends
 * `{ error }` or, for zod, `{ error: "Validation Error", details }`, and
 * `requireRole` sends `{ error: "Forbidden", message }`. Showing `error`
 * alone put "Validation Error" or "Forbidden" on screen with no reason.
 */

export interface FieldIssue {
  field: string;
  message: string;
}

export function apiMessage(data: unknown, fallback: string): string {
  const d = data as { message?: string; error?: string; details?: FieldIssue[] } | null;
  if (d?.details?.length) return d.details.map((x) => (x.field ? `${x.field}: ${x.message}` : x.message)).join(" ");
  return d?.message || d?.error || fallback;
}

/** Zod issues keyed by field, for showing next to the input they belong to. */
export function fieldIssues(data: unknown): Record<string, string> {
  const d = data as { details?: FieldIssue[] } | null;
  const out: Record<string, string> = {};
  for (const issue of d?.details ?? []) if (issue.field && !out[issue.field]) out[issue.field] = issue.message;
  return out;
}
