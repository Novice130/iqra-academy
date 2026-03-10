/**
 * Progress Page — Track learning journey across student profiles
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

// Demo data — will be replaced with real queries
const DEMO_PROFILES = [
  {
    id: "1",
    name: "Aisha",
    track: "Noorani Qaidah",
    level: "Lesson 8 — Connecting Letters",
    totalLessons: 28,
    completedLessons: 8,
    streak: 3,
    recentSessions: [
      { date: "Mar 8", topic: "Lesson 7 — Heavy Letters", status: "completed" as const, notes: "Excellent reading!" },
      { date: "Mar 6", topic: "Lesson 6 — Tanween Practice", status: "completed" as const, notes: "Needs more practice with Kasra Tanween" },
      { date: "Mar 3", topic: "Lesson 5 — Sukoon", status: "completed" as const, notes: "Very good understanding" },
    ],
  },
  {
    id: "2",
    name: "Yusuf",
    track: "Quran Reading",
    level: "Surah Al-Baqarah — Ayah 1-10",
    totalLessons: 114,
    completedLessons: 37,
    streak: 5,
    recentSessions: [
      { date: "Mar 9", topic: "Al-Baqarah: Ayah 8-10", status: "completed" as const, notes: "Tajweed rules applied well" },
      { date: "Mar 7", topic: "Al-Baqarah: Ayah 5-7", status: "completed" as const, notes: "Ikhfa and Idgham mastered" },
      { date: "Mar 4", topic: "Al-Baqarah: Ayah 1-4", status: "completed" as const, notes: "Smooth reading, good pace" },
    ],
  },
];

export default async function ProgressPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  const user = session?.user as { name?: string } | undefined;
  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Progress
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Track {firstName}&apos;s students learning journey
        </p>
      </div>

      <div className="space-y-8">
        {DEMO_PROFILES.map((profile) => {
          const progress = Math.round((profile.completedLessons / profile.totalLessons) * 100);
          return (
            <div key={profile.id} className="card">
              {/* Header */}
              <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      {profile.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {profile.name}
                      </div>
                      <div className="badge badge-accent mt-1" style={{ fontSize: 10, padding: "2px 8px" }}>
                        {profile.track}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold" style={{ color: "var(--accent)" }}>
                      {profile.streak} 🔥
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>week streak</div>
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                    {profile.level}
                  </span>
                  <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                    {progress}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-secondary)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, background: "var(--accent)" }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    {profile.completedLessons} lessons completed
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    {profile.totalLessons - profile.completedLessons} remaining
                  </span>
                </div>
              </div>

              {/* Recent sessions */}
              <div className="p-5">
                <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>
                  Recent Sessions
                </h3>
                <div className="space-y-3">
                  {profile.recentSessions.map((s, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "var(--accent)", color: "#fff", fontSize: 10 }}>
                        ✓
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s.topic}</span>
                          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{s.date}</span>
                        </div>
                        {s.notes && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            📝 {s.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
