/**
 * Progress Page — Track learning journey across student profiles
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, and, desc, count } from "drizzle-orm";
import { studentProfiles, progressRecords, lessonContent } from "@/db/schema";
import { format } from "date-fns";

export default async function ProgressPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) return null;

  const user = session.user as { id: string; name?: string };
  const firstName = user.name?.split(" ")[0] || "there";

  // 1. Fetch Student Profiles with Progress and Lessons
  const profiles = await db.query.studentProfiles.findMany({
    where: eq(studentProfiles.userId, user.id),
    with: {
      progressRecords: {
        where: eq(progressRecords.isCompleted, true),
        with: {
          lesson: true,
          session: true, // For notes and date
        },
        orderBy: [desc(progressRecords.completedAt)],
      },
    },
  });

  // 2. Fetch total lesson counts per track (to calculate %)
  const trackCounts = await db
    .select({
      track: lessonContent.track,
      total: count(),
    })
    .from(lessonContent)
    .groupBy(lessonContent.track);

  const totalLessonsMap = Object.fromEntries(
    trackCounts.map((tc) => [tc.track, tc.total])
  );

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
        {profiles.length > 0 ? (
          profiles.map((profile) => {
            const totalInTrack = totalLessonsMap[profile.track] || 1;
            const completedCount = profile.progressRecords.length;
            const progress = Math.round((completedCount / totalInTrack) * 100);
            const latestRecord = profile.progressRecords[0];

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
                          {profile.track.charAt(0) + profile.track.slice(1).toLowerCase()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold" style={{ color: "var(--accent)" }}>
                        -- 🔥
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>week streak</div>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                      {latestRecord ? `Last: ${latestRecord.lesson.title}` : "Just started..."}
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
                      {completedCount} lessons completed
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {Math.max(0, totalInTrack - completedCount)} remaining
                    </span>
                  </div>
                </div>

                {/* Recent sessions */}
                <div className="p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>
                    Recent History
                  </h3>
                  <div className="space-y-4">
                    {profile.progressRecords.length > 0 ? (
                      profile.progressRecords.slice(0, 5).map((record) => (
                        <div key={record.id} className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "var(--accent)", color: "#fff", fontSize: 10 }}>
                            ✓
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{record.lesson.title}</span>
                              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                {record.completedAt ? format(record.completedAt, "MMM d") : "Completed"}
                              </span>
                            </div>
                            {record.teacherNotes && (
                              <p className="text-xs mt-0.5 italic" style={{ color: "var(--text-secondary)" }}>
                                &quot;{record.teacherNotes}&quot;
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs italic" style={{ color: "var(--text-tertiary)" }}>No records yet.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="card p-10 text-center">
            <p style={{ color: "var(--text-secondary)" }}>No student profiles found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
