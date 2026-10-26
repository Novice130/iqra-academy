"use client";

/**
 * @fileoverview The cancel step for one class: a reason, then a confirm.
 *
 * Inline rather than window.confirm so the reason can be asked for in the
 * same place, and so it is keyboard- and screen-reader-usable. The promise
 * that families are told is true: the PATCH route notifies every booked
 * family and the teacher (lib/admin-scheduling.ts).
 */

import { useId, useState } from "react";
import { btn, input, label } from "@/app/admin/_components/ui";
import { patchSession } from "./session-api";

export default function CancelSessionForm({
  sessionId,
  onCancelled,
  onDismiss,
}: {
  sessionId: string;
  onCancelled: (notified: number) => void;
  onDismiss: () => void;
}) {
  const reasonId = useId();
  const errorId = useId();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Give a reason. It is included in the message to the family and teacher.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await patchSession(sessionId, { status: "CANCELLED", reason: reason.trim() });
    setSaving(false);
    if (result.ok) onCancelled(result.notified);
    else setError(result.error);
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3 text-left"
      onKeyDown={(e) => {
        if (e.key === "Escape") onDismiss();
      }}
    >
      <div>
        <label htmlFor={reasonId} className={label}>
          Reason for cancelling
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
          autoFocus
          aria-describedby={error ? errorId : undefined}
          aria-invalid={!!error}
          placeholder="e.g. Teacher unwell"
          className={`${input} h-auto py-2`}
        />
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Every booked family and the teacher are notified in the app, by push and by email, with this reason.
        </p>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btn.danger} disabled={saving}>
          {saving ? "Cancelling…" : "Cancel class and notify"}
        </button>
        <button type="button" className={btn.secondary} onClick={onDismiss} disabled={saving}>
          Keep class
        </button>
      </div>
    </form>
  );
}
