"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InstantMeetingAdminButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/teachers/instant-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          router.push(data.url);
          return;
        }
        if (data.session?.id) {
          router.push(`/dashboard/session/${data.session.id}`);
          return;
        }
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
    router.push("/dashboard/teacher");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
    >
      <span>⚡</span> {loading ? "Starting..." : "Instant Meeting"}
    </button>
  );
}
