"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface StudentProfileOption {
  id: string;
  name: string;
  userId: string;
  userEmail: string;
  track: string;
}

export interface TeacherOption {
  id: string;
  name: string | null;
  email: string;
  timezone: string | null;
}

export default function AssignStudentDesk({
  students,
  teachers,
}: {
  students: StudentProfileOption[];
  teachers: TeacherOption[];
}) {
  const router = useRouter();
  const [selectedStudent, setSelectedStudent] = useState<string>(students[0]?.id || "");
  const [selectedTeacher, setSelectedTeacher] = useState<string>(teachers[0]?.id || "");
  const [track, setTrack] = useState<string>("QAIDAH");
  const [scheduledDate, setScheduledDate] = useState<string>(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [scheduledTime, setScheduledTime] = useState<string>("10:00");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [customTitle, setCustomTitle] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeStudent = students.find((s) => s.id === selectedStudent);
  const activeTeacher = teachers.find((t) => t.id === selectedTeacher);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedTeacher) {
      setError("Please select both a student and a teacher.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const scheduledStart = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      const res = await fetch("/api/admin/assign-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentProfileId: selectedStudent,
          teacherId: selectedTeacher,
          track,
          scheduledStart,
          durationMinutes,
          title: customTitle.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign student.");

      setSuccess(`✓ Successfully assigned ${activeStudent?.name} to teacher ${activeTeacher?.name || activeTeacher?.email}!`);
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🎓</span>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Assign Student to Teacher
            </h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Pair students with qualified teachers and schedule their Quran lessons.
          </p>
        </div>

        <Link
          href="/admin"
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition self-start sm:self-auto"
        >
          ← Back to Admin
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
          {success}
        </div>
      )}

      {/* Assignment Form */}
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-sm space-y-6">
        <div className="grid sm:grid-cols-2 gap-6">
          {/* Student Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Select Student Profile *
            </label>
            {students.length === 0 ? (
              <div className="p-3 text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)]">
                No student profiles found.
              </div>
            ) : (
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.userEmail}) • {s.track}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Teacher Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Select Teacher *
            </label>
            {teachers.length === 0 ? (
              <div className="p-3 text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)]">
                No teachers available. Promote a user to teacher first.
              </div>
            ) : (
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.email} ({t.email})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Track & Duration */}
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Curriculum Track
            </label>
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="QAIDAH">Noorani Qaida (Beginner)</option>
              <option value="NAZRA">Nazra Quran (Reading)</option>
              <option value="HIFZ">Hifz (Memorization)</option>
              <option value="TAJWEED">Tajweed Rules & Practice</option>
              <option value="ARABIC">Quranic Arabic</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Lesson Duration
            </label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value={30}>30 Minutes</option>
              <option value={45}>45 Minutes</option>
              <option value={60}>60 Minutes (1 Hour)</option>
            </select>
          </div>
        </div>

        {/* Date & Time */}
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Scheduled Date *
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Start Time *
            </label>
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>

        {/* Custom Class Title */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Custom Session Title (Optional)
          </label>
          <input
            type="text"
            placeholder={`e.g. ${activeStudent?.name || "Student"}'s Quran Class with ${activeTeacher?.name || "Teacher"}`}
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        {/* Summary Card */}
        <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-between">
          <div className="text-xs text-[var(--text-secondary)] space-y-0.5">
            <div>
              <strong className="text-[var(--text-primary)]">Student:</strong> {activeStudent?.name || "—"} ({activeStudent?.userEmail})
            </div>
            <div>
              <strong className="text-[var(--text-primary)]">Teacher:</strong> {activeTeacher?.name || activeTeacher?.email || "—"}
            </div>
            <div>
              <strong className="text-[var(--text-primary)]">Schedule:</strong> {scheduledDate} at {scheduledTime} ({durationMinutes} mins)
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !selectedStudent || !selectedTeacher}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md disabled:opacity-50 transition cursor-pointer"
          >
            {saving ? "Assigning..." : "Assign & Schedule Class"}
          </button>
        </div>
      </form>
    </div>
  );
}
