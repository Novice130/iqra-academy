"use client";

/**
 * @fileoverview What an admin can do to one class: cancel, reschedule,
 * reassign, or record how it went.
 *
 * One action open at a time. Each posts to PATCH /api/sessions/[id] and, on
 * success, refreshes the server page so the header, history and attendance
 * all show the new state. Errors stay inline next to the action that caused
 * them.
 *
 * Times are typed in the viewer's zone and sent as a wall-clock reading plus
 * that zone; the server turns it into an instant. The browser's own
 * `new Date("…T17:30")` would use the device zone, which is wrong whenever
 * the account has a zone of its own.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useViewerTimeZone } from "@/components/LocalTime";
import { btn, input, label } from "@/app/admin/_components/ui";
import CancelSessionForm from "../_components/CancelSessionForm";
import { patchSession, toLocalInputValue, type SessionPatch } from "../_components/session-api";

export interface TeacherChoice {
  id: string;
  name: string;
}

type Mode = "cancel" | "reschedule" | "reassign" | null;

export default function SessionActions({
  sessionId,
  status,
  scheduledStart,
  durationMinutes,
  teacherId,
  teachers,
  hasStarted,
}: {
  sessionId: string;
  status: string;
  scheduledStart: string;
  durationMinutes: number;
  teacherId: string;
  teachers: TeacherChoice[];
  /** Server's view of "now is after the scheduled start". */
  hasStarted: boolean;
}) {
  const router = useRouter();
  const zone = useViewerTimeZone();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [localStart, setLocalStart] = useState("");
  const [duration, setDuration] = useState(durationMinutes);
  const otherTeachers = teachers.filter((t) => t.id !== teacherId);
  const [newTeacher, setNewTeacher] = useState(otherTeachers[0]?.id ?? "");

  const canMove = status === "SCHEDULED" && !hasStarted;
  const canCancel = status === "SCHEDULED" || status === "IN_PROGRESS";
  const canMark = hasStarted && status !== "CANCELLED";

  const open = (next: Mode) => {
    setError(null);
    setNotice(null);
    setMode(next);
    if (next === "reschedule") setLocalStart(toLocalInputValue(scheduledStart, zone || undefined));
    // Re-derived each time: after a reassign the page refreshes with a new
    // current teacher, and the old choice would now be a no-op.
    if (next === "reassign") setNewTeacher(otherTeachers[0]?.id ?? "");
  };

  const done = (message: string) => {
    setMode(null);
    setNotice(message);
    router.refresh();
  };

  const send = async (body: SessionPatch, success: (notified: number) => string) => {
    setBusy(true);
    setError(null);
    const result = await patchSession(sessionId, body);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else if (result.ops.length === 0) setError("Nothing changed: the class already looks like that. Reload the page if it seems out of date.");
    else done(success(result.notified));
  };

  const told = (n: number) => (n === 1 ? " 1 person was notified." : n > 1 ? ` ${n} people were notified.` : "");

  if (!canMove && !canCancel && !canMark) {
    return <p className="text-sm text-[var(--text-secondary)]">This class is {status.toLowerCase().replace("_", " ")}; nothing more can be changed.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Class actions">
        {canMove && (
          <>
            <button type="button" className={btn.secondary} aria-expanded={mode === "reschedule"} onClick={() => open(mode === "reschedule" ? null : "reschedule")}>
              Reschedule
            </button>
            <button type="button" className={btn.secondary} aria-expanded={mode === "reassign"} onClick={() => open(mode === "reassign" ? null : "reassign")} disabled={otherTeachers.length === 0}>
              Reassign teacher
            </button>
          </>
        )}
        {canMark && status !== "NO_SHOW" && (
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => send({ status: "NO_SHOW" }, () => "Marked as no-show.")}>
            Mark no-show
          </button>
        )}
        {canMark && status !== "COMPLETED" && (
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => send({ status: "COMPLETED" }, () => "Marked as completed.")}>
            Mark completed
          </button>
        )}
        {canCancel && (
          <button type="button" className={btn.danger} aria-expanded={mode === "cancel"} onClick={() => open(mode === "cancel" ? null : "cancel")}>
            Cancel class
          </button>
        )}
      </div>

      {mode === "cancel" && (
        <CancelSessionForm sessionId={sessionId} onCancelled={(n) => done(`Class cancelled.${told(n)}`)} onDismiss={() => setMode(null)} />
      )}

      {mode === "reschedule" && (
        <form
          className="grid gap-3 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!localStart || !zone) return setError("Pick a new date and time.");
            send({ localStart, timeZone: zone, durationMinutes: duration }, (n) => `Class rescheduled.${told(n)}`);
          }}
        >
          <div>
            <label htmlFor="reschedule-start" className={label}>
              New start {zone && <span className="font-normal">({zone})</span>}
            </label>
            <input id="reschedule-start" type="datetime-local" required value={localStart} onChange={(e) => setLocalStart(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="reschedule-duration" className={label}>
              Length
            </label>
            <select id="reschedule-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={input}>
              {[...new Set([30, 45, 60, 90, durationMinutes])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={btn.primary} disabled={busy}>
            {busy ? "Saving…" : "Save and notify"}
          </button>
        </form>
      )}

      {mode === "reassign" && (
        <form
          className="grid gap-3 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTeacher) return setError("Pick a teacher.");
            if (newTeacher === teacherId) return setError("That teacher already teaches this class. Pick another.");
            send({ teacherId: newTeacher }, (n) => `Teacher changed.${told(n)}`);
          }}
        >
          <div>
            <label htmlFor="reassign-teacher" className={label}>
              New teacher
            </label>
            <select id="reassign-teacher" value={newTeacher} onChange={(e) => setNewTeacher(e.target.value)} className={input}>
              {otherTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Both teachers and the booked families are notified. The new teacher must be free at this time.</p>
          </div>
          <button type="submit" className={btn.primary} disabled={busy || !newTeacher}>
            {busy ? "Saving…" : "Reassign and notify"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm font-medium text-[var(--color-success)]">
          {notice}
        </p>
      )}
    </div>
  );
}
