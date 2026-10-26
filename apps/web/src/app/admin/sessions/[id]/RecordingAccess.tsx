"use client";

/**
 * @fileoverview Who may watch a class recording — the same switch the
 * teacher has, through the same route (POST /api/sessions/[id]/recording),
 * so the host rules there decide.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, input, label } from "@/app/admin/_components/ui";

const OPTIONS = [
  { value: "NONE", label: "Nobody but staff" },
  { value: "STUDENT_ONLY", label: "The student" },
  { value: "STUDENT_AND_OBSERVERS", label: "The student and their observers" },
  { value: "ALL", label: "Everyone in the school" },
] as const;

export default function RecordingAccess({ sessionId, access }: { sessionId: string; access: string }) {
  const router = useRouter();
  const [value, setValue] = useState(access);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="recording-access" className={label}>
          Who can watch it
        </label>
        <select id="recording-access" value={value} onChange={(e) => setValue(e.target.value)} className={input}>
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={btn.secondary} disabled={saving || value === access}>
        {saving ? "Saving…" : "Save"}
      </button>
      {error && <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
      {saved && !error && <p role="status" className="text-xs text-[var(--color-success)]">Saved.</p>}
    </form>
  );
}
