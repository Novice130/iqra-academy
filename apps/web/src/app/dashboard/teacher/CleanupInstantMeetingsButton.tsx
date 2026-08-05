"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CleanupInstantMeetingsButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const cleanup = async () => {
    if (!confirm("Delete all instant meetings? This removes them permanently and can't be undone.")) {
      return;
    }
    try {
      setIsLoading(true);
      const res = await fetch("/api/teachers/instant-meeting/cleanup", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        alert("Failed to clean up meetings.");
      }
    } catch (error) {
      console.error(error);
      alert("Error cleaning up meetings.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={cleanup}
      disabled={isLoading}
      className="card p-4 w-full text-left hover:opacity-80 transition-opacity"
    >
      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {isLoading ? "Cleaning up..." : "🧹 Clear Instant Meetings"}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
        End and delete all instant meetings
      </div>
    </button>
  );
}
