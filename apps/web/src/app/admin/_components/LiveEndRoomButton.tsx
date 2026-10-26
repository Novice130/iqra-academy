"use client";

/**
 * @fileoverview "End room" for a live class card, with an inline confirm step.
 *
 * Closes the LiveKit room through POST /api/admin/livekit-rooms. Ending the
 * room is enough to end the class: LiveKit then sends `room_finished`, and the
 * webhook closes attendance and marks an IN_PROGRESS session COMPLETED. The
 * confirm text says so, because "room" alone undersells what happens.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn } from "./ui";

export default function LiveEndRoomButton({ roomName, title }: { roomName: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRoom = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/livekit-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", roomName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : null;
        setError(msg ?? "Couldn't end the room. Try again.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setPending(false);
    }
  };

  if (!confirming) {
    return (
      <button type="button" className={btn.ghost} onClick={() => setConfirming(true)} aria-label={`End room for ${title}`}>
        End room
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3 space-y-2" role="group" aria-label="Confirm ending the room">
      <p className="text-xs text-[var(--text-primary)]">
        End this room? Everyone is disconnected and the class is marked complete.
      </p>
      {error && (
        <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.danger} onClick={endRoom} disabled={pending}>
          {pending ? "Ending…" : "End room"}
        </button>
        <button
          type="button"
          className={btn.secondary}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          autoFocus
        >
          Keep open
        </button>
      </div>
    </div>
  );
}
