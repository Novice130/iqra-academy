"use client";

/**
 * @fileoverview The booking form behind /admin/assign-student.
 *
 * Sends the date and time as typed plus the zone they were typed in; the API
 * turns that into an instant (and steps it a week at a time for repeats).
 * Building the instant here with `new Date("…T17:30")` would use the device
 * zone, which is wrong whenever the account has its own zone.
 *
 * For a SUPER_ADMIN the teacher list is narrowed to the chosen student's org,
 * because the API refuses a booking across two orgs.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useViewerTimeZone } from "@/components/LocalTime";
import { Panel, btn, input, label } from "@/app/admin/_components/ui";
import AssignResult, { type AssignOutcome } from "./AssignResult";

export interface StudentProfileOption {
  id: string;
  name: string;
  userId: string;
  userEmail: string;
  track: string;
  orgId: string;
  /** Set for a SUPER_ADMIN, who sees every org. */
  orgName: string | null;
}

export interface TeacherOption {
  id: string;
  name: string;
  email: string;
  timezone: string | null;
  orgId: string;
}

export interface AssignPrefill {
  studentId: string | null;
  teacherId: string | null;
  date: string | null;
  time: string | null;
  timeZone: string | null;
}

const TRACKS = [
  { value: "QAIDAH", label: "Qaidah" },
  { value: "QURAN_READING", label: "Quran reading" },
  { value: "HIFZ", label: "Hifz" },
];

export default function AssignStudentDesk({
  students,
  teachers,
  prefill,
  defaultDate,
}: {
  students: StudentProfileOption[];
  teachers: TeacherOption[];
  prefill: AssignPrefill;
  defaultDate: string;
}) {
  const router = useRouter();
  const viewerZone = useViewerTimeZone();
  const zone = prefill.timeZone || viewerZone;

  // A prefilled teacher decides the org when no student was given.
  const prefillTeacher = teachers.find((t) => t.id === prefill.teacherId);
  const firstStudent =
    students.find((s) => s.id === prefill.studentId) ??
    (prefillTeacher ? students.find((s) => s.orgId === prefillTeacher.orgId) : undefined) ??
    students[0];

  const [studentId, setStudentId] = useState(firstStudent?.id ?? "");
  const student = students.find((s) => s.id === studentId);
  const orgTeachers = useMemo(() => teachers.filter((t) => !student || t.orgId === student.orgId), [teachers, student]);
  const [teacherChoice, setTeacherChoice] = useState(prefillTeacher?.id ?? "");
  // Fall back to the org's first teacher whenever the chosen one is not in it.
  const teacherId = orgTeachers.some((t) => t.id === teacherChoice) ? teacherChoice : orgTeachers[0]?.id ?? "";
  const teacher = orgTeachers.find((t) => t.id === teacherId);

  const [track, setTrack] = useState(firstStudent?.track ?? "QAIDAH");
  const [date, setDate] = useState(prefill.date ?? defaultDate);
  const [time, setTime] = useState(prefill.time ?? "17:00");
  const [duration, setDuration] = useState(30);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [title, setTitle] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AssignOutcome | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !teacherId) return setError("Choose a student and a teacher.");
    if (!zone) return setError("Your time zone is still loading. Try again in a moment.");
    setSaving(true);
    setError(null);
    setOutcome(null);
    try {
      const res = await fetch("/api/admin/assign-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentProfileId: studentId,
          teacherId,
          track,
          date,
          time,
          timeZone: zone,
          durationMinutes: duration,
          repeatWeeks,
          title: title.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.created)) {
        setOutcome({ message: data.message, error: data.error, created: data.created, skipped: data.skipped ?? [] });
        if (data.created.length > 0) router.refresh();
      } else {
        const detail = Array.isArray(data.details) ? data.details.map((d: { message: string }) => d.message).join(" ") : "";
        setError(detail || data.error || `Request failed (${res.status}).`);
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (students.length === 0 || teachers.length === 0) {
    return (
      <Panel>
        <p className="text-sm text-[var(--text-secondary)]">
          {students.length === 0 ? "There are no student profiles yet." : "There are no teachers yet. Give someone the teacher role first."}
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Panel title="Class details">
        <form onSubmit={submit} className="space-y-5" aria-describedby={error ? "assign-error" : undefined}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="assign-student" className={label}>Student</label>
              <select
                id="assign-student"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  const next = students.find((s) => s.id === e.target.value);
                  if (next) setTrack(next.track);
                }}
                className={input}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.userEmail}){s.orgName ? ` · ${s.orgName}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="assign-teacher" className={label}>Teacher</label>
              <select id="assign-teacher" value={teacherId} onChange={(e) => setTeacherChoice(e.target.value)} className={input} disabled={orgTeachers.length === 0}>
                {orgTeachers.length === 0 && <option value="">No teachers in this student&apos;s school</option>}
                {orgTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.timezone ? ` (${t.timezone})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="assign-track" className={label}>Track</label>
              <select id="assign-track" value={track} onChange={(e) => setTrack(e.target.value)} className={input}>
                {TRACKS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="assign-duration" className={label}>Length</label>
              <select id="assign-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={input}>
                {[30, 45, 60].map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="assign-date" className={label}>{repeatWeeks > 1 ? "First class date" : "Date"}</label>
              <input id="assign-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="assign-time" className={label}>
                Start time {zone && <span className="font-normal">({zone})</span>}
              </label>
              <input id="assign-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="assign-repeat" className={label}>Repeat weekly</label>
              <select id="assign-repeat" value={repeatWeeks} onChange={(e) => setRepeatWeeks(Number(e.target.value))} className={input}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n === 1 ? "Just this once" : `For ${n} weeks`}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="assign-title" className={label}>Title (optional)</label>
              <input
                id="assign-title"
                type="text"
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`${track} Lesson with ${teacher?.name ?? "teacher"}`}
                className={input}
              />
            </div>
          </div>

          {error && (
            <p id="assign-error" role="alert" className="text-sm font-medium text-[var(--color-danger)]">{error}</p>
          )}

          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--text-secondary)]">
              {student?.name ?? "Student"} with {teacher?.name ?? "teacher"}, {date} at {time}
              {repeatWeeks > 1 ? `, then the same time weekly for ${repeatWeeks} weeks` : ""}. Weeks that clash are skipped and listed.
            </p>
            <button type="submit" className={btn.primary} disabled={saving || !studentId || !teacherId}>
              {saving ? "Booking…" : repeatWeeks > 1 ? `Book ${repeatWeeks} classes` : "Book class"}
            </button>
          </div>
        </form>
      </Panel>

      {outcome && <AssignResult outcome={outcome} />}
    </div>
  );
}
