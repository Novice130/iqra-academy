"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartInstantMeetingButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [meeting, setMeeting] = useState<{ sessionId: string; joinUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const startMeeting = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/teachers/instant-meeting", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success && data.sessionId) {
        setMeeting({ sessionId: data.sessionId, joinUrl: data.joinUrl });
      } else {
        console.error("Failed to start meeting", data);
        alert("Failed to start meeting.");
      }
    } catch (error) {
      console.error(error);
      alert("Error starting meeting.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = async () => {
    if (!meeting) return;
    await navigator.clipboard.writeText(meeting.joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (meeting) {
    return (
      <div className="card p-4 w-full">
        <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Meeting started
        </div>
        <div className="text-xs mb-3 break-all" style={{ color: "var(--text-tertiary)" }}>
          {meeting.joinUrl}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyLink}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <button
            onClick={() => router.push(`/dashboard/session/${meeting.sessionId}`)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Enter Meeting
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={startMeeting}
      disabled={isLoading}
      className="card p-4 w-full text-left hover:opacity-80 transition-opacity"
    >
      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {isLoading ? "Starting..." : "⚡ Start Instant Meeting"}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
        Spin up a video call and share the link
      </div>
    </button>
  );
}
