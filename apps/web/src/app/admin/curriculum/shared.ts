/**
 * @fileoverview Client-safe pieces shared by the /admin/curriculum components:
 * the track list, the row type, and one fetch helper that turns an API error
 * into a sentence the admin can act on.
 */

import type { CurriculumLesson, Track } from "@/lib/admin-curriculum";

export type { CurriculumLesson, Track };

/** Mirrors trackEnum in db/schema.ts, in the order a student meets them. */
export const TRACKS: { value: Track; label: string; blurb: string }[] = [
  { value: "QAIDAH", label: "Qaidah", blurb: "Letters, vowels and joining — before reading the mushaf." },
  { value: "QURAN_READING", label: "Quran reading", blurb: "Reading the Quran with tajweed." },
  { value: "HIFZ", label: "Hifz", blurb: "Memorisation." },
];

export interface DeskMessage {
  text: string;
  bad: boolean;
}

/** Sends JSON and returns null on success, or the reason it failed. */
export async function sendJson(url: string, method: "POST" | "PATCH", body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { error?: string; details?: { field: string; message: string }[] }
      | null;
    const detail = data?.details?.[0];
    if (detail) return detail.field ? `${detail.field}: ${detail.message}` : detail.message;
    return data?.error || `The server answered ${res.status}.`;
  } catch {
    return "Couldn't reach the server. Check the connection and try again.";
  }
}
