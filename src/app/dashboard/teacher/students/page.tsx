/**
 * Teacher Students Page — View and manage assigned students
 */

import Link from "next/link";

const STUDENTS = [
  { id: "1", name: "Ahmad Khalid", age: 10, track: "Noorani Qaidah", level: "Lesson 12", progress: 42, lastClass: "Mar 10", attendance: "95%", notes: "Steady improvement, needs practice on Shaddah" },
  { id: "2", name: "Fatima Rahman", age: 14, track: "Tajweed", level: "Noon Sakinah Rules", progress: 78, lastClass: "Mar 10", attendance: "100%", notes: "Excellent — ready for Meem Sakinah" },
  { id: "3", name: "Zayd Mahmoud", age: 9, track: "Hifz", level: "Surah Yaseen (Ayah 1-20)", progress: 15, lastClass: "Mar 9", attendance: "88%", notes: "Memorization pace is good, needs revision help" },
  { id: "4", name: "Aisha Syed", age: 8, track: "Noorani Qaidah", level: "Lesson 8", progress: 28, lastClass: "Mar 8", attendance: "92%", notes: "Learning fast, connecting letters well" },
  { id: "5", name: "Yusuf Syed", age: 11, track: "Quran Reading", level: "Al-Baqarah Ayah 1-10", progress: 32, lastClass: "Mar 9", attendance: "96%", notes: "Tajweed rules applied consistently" },
];

export default function TeacherStudentsPage() {
  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            My Students
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {STUDENTS.length} active students
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {STUDENTS.map((student) => (
          <div key={student.id} className="card">
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "var(--accent)" }}>
                    {student.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{student.name}</div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Age {student.age} • {student.track}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full" style={{ background: "#f0f9ff", color: "#0369a1" }}>
                    {student.attendance} attendance
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Last: {student.lastClass}</span>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{student.level}</span>
                <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>{student.progress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "var(--bg-secondary)" }}>
                <div className="h-full rounded-full" style={{ width: `${student.progress}%`, background: "var(--accent)" }} />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  📝 {student.notes}
                </p>
                <button className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  Add Feedback
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
