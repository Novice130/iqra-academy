"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StudentProfile {
  id: string;
  name: string;
  track: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

export default function AssignStudentModal({
  students,
  teachers,
}: {
  students: StudentProfile[];
  teachers: Teacher[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || "");
  const [selectedTeacherId, setSelectedTeacherId] = useState(teachers[0]?.id || "");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !selectedTeacherId) return;

    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/assign-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentProfileId: selectedStudentId,
          teacherId: selectedTeacherId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert("Student assigned to teacher successfully!");
        setIsOpen(false);
        router.refresh();
      } else {
        alert(data.error || "Failed to assign student.");
      }
    } catch (err) {
      console.error(err);
      alert("Error assigning student.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 text-xs font-semibold rounded-lg text-white"
        style={{ background: "var(--accent)" }}
      >
        ➕ Assign Student to Teacher
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card p-6 w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl shadow-xl">
            <h3 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              Assign Student to Teacher
            </h3>

            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Select Student
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full p-2 text-sm rounded-lg border bg-transparent"
                  style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.track})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Select Teacher
                </label>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full p-2 text-sm rounded-lg border bg-transparent"
                  style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border"
                  style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg text-white"
                  style={{ background: "var(--accent)" }}
                >
                  {isLoading ? "Assigning..." : "Confirm Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
