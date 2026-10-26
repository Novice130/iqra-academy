"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SessionRowActions({
  sessionId,
  showEnd,
}: {
  sessionId: string;
  showEnd: boolean;
}) {
  const [isLoading, setIsLoading] = useState<"end" | "delete" | null>(null);
  // Inline confirm instead of window.confirm, which blocks the page and is
  // suppressed outright in some embedded webviews (the desktop app).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = async (kind: "end" | "delete", url: string, method: "POST" | "DELETE") => {
    setIsLoading(kind);
    setError(null);
    try {
      const res = await fetch(url, { method });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : kind === "end" ? "Couldn't end it." : "Couldn't delete it.");
        return;
      }
      setConfirmingDelete(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setIsLoading(null);
    }
  };

  const endSession = () => run("end", `/api/sessions/${sessionId}/end`, "POST");
  const deleteSession = () => run("delete", `/api/sessions/${sessionId}`, "DELETE");

  const buttonClass = "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors";
  const neutral = { background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" };
  const danger = { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };

  if (confirmingDelete) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Confirm deleting this class">
        <span className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
          Delete permanently?
        </span>
        <button type="button" onClick={deleteSession} disabled={isLoading !== null} className={buttonClass} style={danger}>
          {isLoading === "delete" ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmingDelete(false);
            setError(null);
          }}
          disabled={isLoading !== null}
          className={buttonClass}
          style={neutral}
          autoFocus
        >
          Keep
        </button>
        {error && (
          <span role="alert" className="text-[11px] font-medium" style={{ color: "#991b1b" }}>
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showEnd && (
        <button type="button" onClick={endSession} disabled={isLoading !== null} className={buttonClass} style={neutral}>
          {isLoading === "end" ? "Ending…" : "End"}
        </button>
      )}
      <button type="button" onClick={() => setConfirmingDelete(true)} disabled={isLoading !== null} className={buttonClass} style={danger}>
        Delete
      </button>
      {error && (
        <span role="alert" className="text-[11px] font-medium" style={{ color: "#991b1b" }}>
          {error}
        </span>
      )}
    </div>
  );
}
