/**
 * @fileoverview Client-side calls for changing a class, shared by the session
 * detail page and the scheduled-classes list.
 *
 * Everything goes through PATCH /api/sessions/[id] — the same route teachers
 * use — so the rules, audit and notifications in lib/admin-scheduling.ts apply
 * whichever screen the change came from.
 */

export type SessionPatch =
  | { status: "CANCELLED"; reason: string }
  | { status: "NO_SHOW" | "COMPLETED" }
  | { localStart: string; timeZone: string; durationMinutes: number }
  | { teacherId: string };

export type PatchResult =
  | { ok: true; notified: number }
  | { ok: false; error: string };

/** Never throws: a network failure comes back as `{ ok: false }`. */
export async function patchSession(sessionId: string, body: SessionPatch): Promise<PatchResult> {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = Array.isArray(data.details) ? data.details.map((d: { message: string }) => d.message).join(" ") : "";
      return { ok: false, error: detail || data.error || data.message || `Request failed (${res.status}).` };
    }
    return { ok: true, notified: typeof data.notified === "number" ? data.notified : 0 };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, read in `zone`. */
export function toLocalInputValue(iso: string, zone: string | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: zone || undefined,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date)) {
    parts[p.type] = p.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
