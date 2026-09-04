"use client";

/**
 * "Instant Meeting" — one tap, straight into the room.
 *
 * This used to open a student picker first, then a card with a copy-link and
 * an "Enter Meeting" button: three steps to begin a lesson that was already on
 * the calendar. Worse, it always created a *new* session row, so the students
 * (whose dashboards link at the scheduled row) ended up in different rooms.
 *
 * The server now resumes the running or scheduled class when there is one and
 * notifies whoever is booked on it, so there is nothing left to ask the
 * teacher up front.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartInstantMeetingButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const startMeeting = async () => {
    if (isLoading) return;
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/teachers/instant-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (res.ok && data.success && data.sessionId) {
        router.push(`/dashboard/session/${data.sessionId}`);
        return;
      }
      setError(data.error || "Couldn't start the class. Try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={startMeeting}
      disabled={isLoading}
      className="card p-4 w-full text-left hover:opacity-80 transition-opacity disabled:opacity-60"
    >
      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {isLoading ? "Starting…" : "⚡ Instant Meeting"}
      </div>
      <div className="text-xs mt-0.5" style={{ color: error ? "#c5221f" : "var(--text-tertiary)" }}>
        {error || "Starts an instant meeting or resumes due scheduled class"}
      </div>
    </button>
  );
}
