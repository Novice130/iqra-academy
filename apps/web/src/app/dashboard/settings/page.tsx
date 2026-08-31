"use client";

/**
 * Settings Page — Account management and student profiles
 * Fully wired to real user data, student profile CRUD, and password changes.
 */

import { useState, useEffect } from "react";
import TimeZoneCard from "./TimeZoneCard";
import TwoFactorAuthCard from "./TwoFactorAuthCard";
import DeleteAccountCard from "./DeleteAccountCard";
import { authClient } from "@/lib/auth-client";

interface StudentProfile {
  id: string;
  name: string;
  dateOfBirth?: string | null;
  track: "QAIDAH" | "QURAN_READING" | "HIFZ";
  currentLevel?: string | null;
  notes?: string | null;
}

const TRACK_LABELS: Record<string, string> = {
  QAIDAH: "Noorani Qaida",
  QURAN_READING: "Quran Reading with Tajweed",
  HIFZ: "Quran Memorization (Hifz)",
};

export default function SettingsPage() {
  const { data: session } = authClient.useSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("STUDENT");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password change modal state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Student profile state
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentProfile | null>(null);
  const [studentName, setStudentName] = useState("");
  const [studentTrack, setStudentTrack] = useState<"QAIDAH" | "QURAN_READING" | "HIFZ">("QAIDAH");
  const [studentDob, setStudentDob] = useState("");
  const [studentNotes, setStudentNotes] = useState("");
  const [savingStudent, setSavingStudent] = useState(false);
  const [studentError, setStudentError] = useState("");

  // 1. Fetch user account details
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setName(data.user.name || "");
            setEmail(data.user.email || "");
            setRole(data.user.role || "STUDENT");
          }
        } else if (session?.user) {
          setName(session.user.name || "");
          setEmail(session.user.email || "");
        }
      } catch {
        if (session?.user) {
          setName(session.user.name || "");
          setEmail(session.user.email || "");
        }
      }
    }
    loadUser();
  }, [session]);

  // 2. Fetch student profiles (if student/family account)
  const fetchStudents = async () => {
    try {
      setLoadingStudents(true);
      const res = await fetch("/api/students/profiles");
      if (res.ok) {
        const data = await res.json();
        setStudents(data.profiles || []);
      }
    } catch (err) {
      console.error("Failed to load student profiles:", err);
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // Save account name
  const handleSaveAccount = async () => {
    if (!name.trim()) return;
    setSavingAccount(true);
    setAccountMessage(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setAccountMessage({ type: "success", text: "Account settings saved successfully." });
        setTimeout(() => setAccountMessage(null), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setAccountMessage({ type: "error", text: data.error || "Failed to save settings." });
      }
    } catch {
      setAccountMessage({ type: "error", text: "Something went wrong saving settings." });
    } finally {
      setSavingAccount(false);
    }
  };

  // Change password handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await authClient.changePassword({
        newPassword,
        currentPassword,
        revokeOtherSessions: true,
      });

      if (error) {
        setPasswordError(error.message || "Failed to change password. Check your current password.");
      } else {
        setPasswordSuccess("Password changed successfully!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          setPasswordModalOpen(false);
          setPasswordSuccess("");
        }, 1800);
      }
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setChangingPassword(false);
    }
  };

  // Open add student modal
  const handleOpenAddStudent = () => {
    setEditingStudent(null);
    setStudentName("");
    setStudentTrack("QAIDAH");
    setStudentDob("");
    setStudentNotes("");
    setStudentError("");
    setStudentModalOpen(true);
  };

  // Open edit student modal
  const handleOpenEditStudent = (student: StudentProfile) => {
    setEditingStudent(student);
    setStudentName(student.name);
    setStudentTrack(student.track || "QAIDAH");
    setStudentDob(student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "");
    setStudentNotes(student.notes || "");
    setStudentError("");
    setStudentModalOpen(true);
  };

  // Save student (Add or Edit)
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setStudentError("Student name is required.");
      return;
    }

    setSavingStudent(true);
    setStudentError("");

    try {
      const payload: Record<string, any> = {
        name: studentName.trim(),
        track: studentTrack,
        notes: studentNotes.trim() || null,
        dateOfBirth: studentDob ? new Date(studentDob).toISOString() : null,
      };

      if (editingStudent) {
        const res = await fetch(`/api/students/profiles/${editingStudent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update student profile.");
        }
      } else {
        const res = await fetch("/api/students/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create student profile.");
        }
      }

      setStudentModalOpen(false);
      await fetchStudents();
    } catch (err: any) {
      setStudentError(err.message || "Something went wrong.");
    } finally {
      setSavingStudent(false);
    }
  };

  // Delete student profile
  const handleDeleteStudent = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove the profile for ${name}?`)) return;
    try {
      const res = await fetch(`/api/students/profiles/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchStudents();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete student profile.");
      }
    } catch {
      alert("Error deleting student profile.");
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Manage your account and student profiles
        </p>
      </div>

      {accountMessage && (
        <div
          className="mb-6 px-4 py-3 rounded-xl text-sm font-medium animate-fadeIn"
          style={{
            background: accountMessage.type === "success" ? "#dcfce7" : "#fee2e2",
            color: accountMessage.type === "success" ? "#166534" : "#991b1b",
          }}
        >
          {accountMessage.type === "success" ? "✅" : "✕"} {accountMessage.text}
        </div>
      )}

      {/* Account info */}
      <section className="card mb-6">
        <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Account Profile
          </h2>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none opacity-60 cursor-not-allowed"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              Account email is verified and cannot be changed directly.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Security
            </label>
            <button
              type="button"
              onClick={() => setPasswordModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer hover:brightness-110"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              🔒 Change Password
            </button>
          </div>
        </div>
      </section>

      <TimeZoneCard />

      {/* Student profiles */}
      {role === "STUDENT" && (
        <section className="card mb-6">
          <div className="p-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                Student Profiles
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Manage child profiles enrolled in your family plan
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddStudent}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition hover:opacity-90 cursor-pointer shadow-xs"
              style={{ background: "var(--accent)" }}
            >
              + Add Student
            </button>
          </div>

          {loadingStudents ? (
            <div className="p-8 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
              Loading student profiles…
            </div>
          ) : students.length > 0 ? (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {students.map((student) => {
                const trackLabel = TRACK_LABELS[student.track] || student.track;
                const age = student.dateOfBirth
                  ? `${new Date().getFullYear() - new Date(student.dateOfBirth).getFullYear()} yrs old`
                  : null;

                return (
                  <div key={student.id} className="p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-xs"
                        style={{ background: "var(--accent)" }}
                      >
                        {student.name[0]?.toUpperCase() || "S"}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {student.name}
                        </div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
                          {age ? `${age} • ` : ""}
                          {trackLabel}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditStudent(student)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer transition hover:bg-white/10"
                        style={{
                          background: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStudent(student.id, student.name)}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer text-red-500 hover:bg-red-500/10 transition"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                No student profiles created yet. Tap &quot;+ Add Student&quot; to begin.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Notifications */}
      <section className="card mb-6">
        <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Notifications
          </h2>
        </div>
        <div className="p-5 space-y-4">
          {[
            { label: "Class reminders", desc: "30 min before each session", defaultChecked: true },
            { label: "Weekly progress digest", desc: "Summary every Friday", defaultChecked: true },
            { label: "Payment receipts", desc: "After each billing cycle", defaultChecked: true },
            { label: "Promotional updates", desc: "New courses and announcements", defaultChecked: false },
          ].map((pref) => (
            <label key={pref.label} className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {pref.label}
                </div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {pref.desc}
                </div>
              </div>
              <input
                type="checkbox"
                defaultChecked={pref.defaultChecked}
                className="w-4 h-4 rounded accent-[#059669] cursor-pointer"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Two-Factor Authentication (2FA) */}
      <TwoFactorAuthCard />

      {/* Account Deletion */}
      <DeleteAccountCard />

      <div className="flex justify-end mt-6">
        <button
          type="button"
          onClick={handleSaveAccount}
          disabled={savingAccount}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition cursor-pointer disabled:opacity-60 shadow-md"
          style={{ background: "var(--accent)" }}
        >
          {savingAccount ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Change Password Modal */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-3xl p-6 shadow-2xl animate-fadeIn relative"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <h3 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              Change Password
            </h3>
            <p className="text-xs mb-5" style={{ color: "var(--text-secondary)" }}>
              Enter your current password and pick a new secure password.
            </p>

            {passwordError && (
              <div className="mb-4 p-3 rounded-xl text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20">
                ✕ {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="mb-4 p-3 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                ✓ {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs outline-none"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                  New Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs outline-none"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs outline-none"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-60 shadow-md"
                  style={{ background: "var(--accent)" }}
                >
                  {changingPassword ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Student Modal */}
      {studentModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-3xl p-6 shadow-2xl animate-fadeIn relative"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <h3 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              {editingStudent ? "Edit Student Profile" : "Add Student Profile"}
            </h3>
            <p className="text-xs mb-5" style={{ color: "var(--text-secondary)" }}>
              {editingStudent
                ? "Update student name, learning track, or details."
                : "Create a child profile for your family Quran classes."}
            </p>

            {studentError && (
              <div className="mb-4 p-3 rounded-xl text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20">
                ✕ {studentError}
              </div>
            )}

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                  Student Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ibrahim Amer"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs outline-none"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                  Learning Track
                </label>
                <select
                  value={studentTrack}
                  onChange={(e) => setStudentTrack(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs outline-none cursor-pointer"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <option value="QAIDAH">Noorani Qaida (Beginner)</option>
                  <option value="QURAN_READING">Quran Reading with Tajweed (Intermediate)</option>
                  <option value="HIFZ">Quran Memorization / Hifz (Advanced)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                  Date of Birth (Optional)
                </label>
                <input
                  type="date"
                  value={studentDob}
                  onChange={(e) => setStudentDob(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs outline-none"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                  Notes for Teacher (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Any background or preferences for the teacher…"
                  value={studentNotes}
                  onChange={(e) => setStudentNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs outline-none resize-none"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setStudentModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStudent}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white cursor-pointer disabled:opacity-60 shadow-md"
                  style={{ background: "var(--accent)" }}
                >
                  {savingStudent ? "Saving…" : editingStudent ? "Save Changes" : "Create Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
