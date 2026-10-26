"use client";

/**
 * @fileoverview Record a follow-up on one trial: contacted, declined, or clear.
 * Posts to PATCH /api/admin/trials, then refreshes so the derived stage
 * (which "declined" changes) is recomputed on the server.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TrialRow } from "@/lib/admin-students";
import { btn } from "../_components/ui";
import type { TrialFollowUp } from "./stages";

export default function FollowUpControl({ row }: { row: TrialRow }) {
  const router = useRouter();
  const [pending, setPending] = useState<TrialFollowUp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const current = row.followUp?.value ?? "NONE";
  const busy = pending !== null || refreshing;

  async function record(followUp: TrialFollowUp) {
    setPending(followUp);
    setError(null);
    try {
      const res = await fetch("/api/admin/trials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: row.sessionId, followUp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the follow-up.");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the follow-up.");
    } finally {
      setPending(null);
    }
  }

  const label = (value: TrialFollowUp, idle: string) => (pending === value ? "Saving…" : idle);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1" role="group" aria-label={`Follow-up for ${row.contactName}`}>
        {current !== "CONTACTED" && (
          <button type="button" className={btn.ghost} disabled={busy} onClick={() => record("CONTACTED")}>
            {label("CONTACTED", "Mark contacted")}
          </button>
        )}
        {current !== "DECLINED" && row.stage !== "CONVERTED" && (
          <button type="button" className={btn.ghost} disabled={busy} onClick={() => record("DECLINED")}>
            {label("DECLINED", "Mark declined")}
          </button>
        )}
        {current !== "NONE" && (
          <button type="button" className={btn.ghost} disabled={busy} onClick={() => record("NONE")}>
            {label("NONE", "Clear follow-up")}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
