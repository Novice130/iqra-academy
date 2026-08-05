"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Student {
  studentProfileId: string;
  userId: string;
  name: string;
}

export default function StartInstantMeetingButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [meeting, setMeeting] = useState<{ sessionId: string; joinUrl: string; addedNames: string[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();

  const openPicker = async () => {
    setPicking(true);
    try {
      const res = await fetch("/api/teachers/students");
      const data = await res.json();
      setStudents(data.students || []);
    } catch (error) {
      console.error(error);
    }
  };

  const toggleStudent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startMeeting = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/teachers/instant-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentProfileIds: Array.from(selected) }),
      });
      const data = await res.json();

      if (data.success && data.sessionId) {
        setMeeting({
          sessionId: data.sessionId,
          joinUrl: data.joinUrl,
          addedNames: (data.addedStudents || []).map((s: Student) => s.name),
        });
        setPicking(false);
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
        {meeting.addedNames.length > 0 && (
          <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
            Notified: {meeting.addedNames.join(", ")}
          </div>
        )}
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

  if (picking) {
    return (
      <div className="card p-4 w-full">
        <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          Add students to this meeting
        </div>
        <div className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
          Optional — they&apos;ll be notified in-app when you start.
        </div>

        <div className="max-h-48 overflow-auto space-y-1 mb-3">
          {students.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              No students on your roster yet.
            </div>
          ) : (
            students.map((s) => (
              <label
                key={s.studentProfileId}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer"
                style={{ background: selected.has(s.studentProfileId) ? "var(--bg-secondary)" : "transparent" }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.studentProfileId)}
                  onChange={() => toggleStudent(s.studentProfileId)}
                />
                <span className="text-xs" style={{ color: "var(--text-primary)" }}>{s.name}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setPicking(false);
              setSelected(new Set());
            }}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            Cancel
          </button>
          <button
            onClick={startMeeting}
            disabled={isLoading}
            className="flex-1 py-2 rounded-lg text-xs font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            {isLoading ? "Starting..." : `Start${selected.size > 0 ? ` (${selected.size} added)` : ""}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={openPicker}
      className="card p-4 w-full text-left hover:opacity-80 transition-opacity"
    >
      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        ⚡ Start Instant Meeting
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
        Spin up a video call, add students, and share the link
      </div>
    </button>
  );
}
