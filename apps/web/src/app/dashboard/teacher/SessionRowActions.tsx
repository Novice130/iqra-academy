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
  const router = useRouter();

  const endSession = async () => {
    setIsLoading("end");
    try {
      await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
      router.refresh();
    } finally {
      setIsLoading(null);
    }
  };

  const deleteSession = async () => {
    if (!confirm("Delete this session permanently?")) return;
    setIsLoading("delete");
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {showEnd && (
        <button
          onClick={endSession}
          disabled={isLoading !== null}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
          style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          {isLoading === "end" ? "Ending..." : "End"}
        </button>
      )}
      <button
        onClick={deleteSession}
        disabled={isLoading !== null}
        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
        style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}
      >
        {isLoading === "delete" ? "..." : "Delete"}
      </button>
    </div>
  );
}
