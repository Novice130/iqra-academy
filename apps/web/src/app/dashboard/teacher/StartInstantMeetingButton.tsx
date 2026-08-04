"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartInstantMeetingButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const startMeeting = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/teachers/instant-meeting", {
        method: "POST",
      });
      const data = await res.json();
      
      if (data.success && data.sessionId) {
        router.push(`/dashboard/session/${data.sessionId}`);
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
