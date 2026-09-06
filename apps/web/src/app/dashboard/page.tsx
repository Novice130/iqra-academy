/**
 * Dashboard Home — Clean, content-first design
 *
 * Generous whitespace, typography-driven, subtle card shadows.
 * Server component reads session for personalized greeting.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { db, withHttpDb } from "@/lib/db";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { studentProfiles, bookings, subscriptions, sessions, users, progressRecords, lessonContent } from "@/db/schema";
import { getQuotaStatus } from "@/lib/quota";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { shouldHidePricing, subscriptionLabel } from "@/lib/pricing-visibility";
import LocalTime from "@/components/LocalTime";
import ClassActionButton from "@/components/ClassActionButton";

function safeIso(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function safeDateFormat(d: Date | string | null | undefined, fmt: string, fallback: string): string {
  if (!d) return fallback;
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return fallback;
    return format(date, fmt);
  } catch {
    return fallback;
  }
}

export default async function DashboardPage(props: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const searchParams = await props.searchParams;
  return withHttpDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session) return null;

    const user = session.user;

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { role: true, orgId: true },
    });

    const role = dbUser?.role || "STUDENT";
    
    if (["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(role) && searchParams?.error !== "unauthorized") {
      redirect("/dashboard/teacher");
    }

    const firstName = session.user.name?.split(" ")[0] || "there";

    // 1. Fetch Student Profiles
    const profiles = await db.query.studentProfiles.findMany({
      where: eq(studentProfiles.userId, user.id),
      with: {
        progressRecords: {
          orderBy: (pr, { desc }) => [desc(pr.createdAt)],
          limit: 1,
          with: { lesson: true },
        },
      },
      orderBy: asc(studentProfiles.createdAt),
    });

    // 2. Fetch Next Upcoming Class
    let upcoming: any = null;
    try {
      const upcomingBookings = await db
        .select()
        .from(bookings)
        .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
        .innerJoin(users, eq(sessions.teacherId, users.id))
        .where(
          and(
            eq(bookings.userId, user.id),
            eq(bookings.status, "CONFIRMED"),
            gte(sessions.scheduledStart, new Date())
          )
        )
        .orderBy(asc(sessions.scheduledStart))
        .limit(1);

      upcoming = upcomingBookings[0];
    } catch (e) {
      console.warn("Failed to fetch upcoming session:", e);
    }

    // 3. Get Subscription & Quota
    let subscription: any = null;
    try {
      subscription = await db.query.subscriptions.findFirst({
        where: and(eq(subscriptions.userId, user.id), eq(subscriptions.status, "ACTIVE")),
        with: { plan: true },
      });
    } catch (e) {
      console.warn("Failed to fetch subscription:", e);
    }

    let quota = { used: 0, totalAllowed: 0, remaining: 0 };
    if (subscription) {
      try {
        quota = await getQuotaStatus(subscription.id, user.id, dbUser?.orgId || "");
      } catch (e) {
        console.warn("Failed to compute quota status:", e);
      }
    }

    // 4. Calculate total sessions completed
    let totalCompleted = 0;
    try {
      const [sessionCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookings)
        .where(and(eq(bookings.userId, user.id), eq(bookings.status, "COMPLETED")));
      totalCompleted = sessionCount?.count ?? 0;
    } catch (e) {
      console.warn("Failed to count completed sessions:", e);
    }

    // 5. Track counts and student profile progress
    let totalLessonsMap: Record<string, number> = {};
    let totalLessonsCompleted = 0;
    const completedMap: Record<string, number> = {};

    try {
      const trackCounts = await db
        .select({
          track: lessonContent.track,
          total: sql<number>`count(*)::int`,
        })
        .from(lessonContent)
        .groupBy(lessonContent.track);

      totalLessonsMap = Object.fromEntries(
        trackCounts.map((tc) => [tc.track, Number(tc.total) || 1])
      );

      const profileCompletedCounts = await db
        .select({
          studentProfileId: progressRecords.studentProfileId,
          count: sql<number>`count(*)::int`,
        })
        .from(progressRecords)
        .innerJoin(studentProfiles, eq(progressRecords.studentProfileId, studentProfiles.id))
        .where(and(eq(studentProfiles.userId, user.id), eq(progressRecords.isCompleted, true)))
        .groupBy(progressRecords.studentProfileId);

      for (const row of profileCompletedCounts) {
        if (row.studentProfileId) {
          completedMap[row.studentProfileId] = Number(row.count) || 0;
          totalLessonsCompleted += Number(row.count) || 0;
        }
      }
    } catch (e) {
      console.warn("Failed to compute lesson progress:", e);
    }

    // Role, not email: the old allowlist only covered three test accounts.
    const hidePricing = shouldHidePricing(role);

    return (
      <div className="p-6 lg:p-10 max-w-5xl">
        {/* Greeting */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Assalamu Alaikum, {firstName}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Here&apos;s what&apos;s happening with your learning
          </p>
        </div>

        {/* Next class */}
        {upcoming ? (
          <div className="card p-5 mb-8">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="badge badge-accent mb-3">Upcoming</div>
                <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  {typeof upcoming.sessions?.track === "string" && upcoming.sessions.track.length > 0
                    ? (upcoming.sessions.track.charAt(0).toUpperCase() + upcoming.sessions.track.slice(1).toLowerCase())
                    : "Quran Class"} — {upcoming.sessions?.title || "Lesson"}
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Ustadh {upcoming.users?.name || "Teacher"} • 30 min
                </p>
                <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                  <LocalTime iso={safeIso(upcoming.sessions?.scheduledStart)} mode="weekday-time" withZone />
                </p>
              </div>
              <ClassActionButton
                session={upcoming.sessions}
                viewer={{ userId: user.id, role }}
                variant="prominent"
                showDuration
              />
            </div>
          </div>
        ) : (
          <div className="card p-5 mb-8 text-center py-10">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No upcoming classes scheduled.</p>
            <Link href="/dashboard/booking" className="text-xs font-semibold mt-2 inline-block" style={{ color: "var(--accent)" }}>
              Book a session →
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <StatCard label="This week" value={`${quota.used} of ${quota.totalAllowed}`} sub="classes used" />
          <StatCard label="Completed" value={String(totalCompleted)} sub="total sessions" />
          <StatCard label="Lessons" value={String(totalLessonsCompleted)} sub="completed in track" />
          {/* Families get a state, not a figure — "--" under a "Next bill"
              label reads as something broken rather than something withheld. */}
          {hidePricing ? (
            <StatCard
              label="Subscription"
              value={subscriptionLabel(!!subscription)}
              sub={
                subscription
                  ? `Renews ${safeDateFormat(subscription.currentPeriodEnd, "MMM d", "soon")}`
                  : "Contact us to start"
              }
            />
          ) : (
            <StatCard
              label="Next bill"
              value={
                subscription?.plan?.priceInCents != null
                  ? `$${subscription.plan.priceInCents / 100}`
                  : "--"
              }
              sub={
                subscription
                  ? safeDateFormat(subscription.currentPeriodEnd, "MMM d", "Active")
                  : "No plan"
              }
            />
          )}
        </div>

        {/* Quick actions */}
        <div className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ActionCard href="/dashboard/booking" title="Book a Class" desc="Find available slots" />
            <ActionCard href="/dashboard/progress" title="View Progress" desc="Track your journey" />
            <ActionCard href="/dashboard/chat" title="Messages" desc="Chat with teacher" />
            <ActionCard href="/dashboard/settings" title="Settings" desc="Manage profiles" />
          </div>
        </div>

        {/* Student profiles */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Student Profiles
          </h2>
          {profiles.length > 0 ? (
            <div className="grid lg:grid-cols-2 gap-4">
              {profiles.map((profile) => {
                const latestRecord = profile.progressRecords[0];
                const totalInTrack = Number(totalLessonsMap[profile.track] ?? 1) || 1;
                const completedCount = completedMap[profile.id] ?? 0;
                const progressPct = Math.min(100, Math.round((completedCount / totalInTrack) * 100));

                return (
                  <ProfileCard
                    key={profile.id}
                    name={profile.name || "Student"}
                    track={
                      typeof profile.track === "string" && profile.track.length > 0
                        ? (profile.track.charAt(0).toUpperCase() + profile.track.slice(1).toLowerCase())
                        : "Nazira"
                    }
                    lesson={latestRecord?.lesson?.title || "Beginning track..."}
                    progress={progressPct}
                  />
                );
              })}
            </div>
          ) : (
            <div className="card p-8 text-center">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No student profiles created yet.</p>
              <Link href="/dashboard/settings" className="btn-primary mt-4 inline-block" style={{ fontSize: 12 }}>
                Add a Student
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  });
}

/* ── Components ──────────────────────────────────────────────────────────── */

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      <div className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{sub}</div>
    </div>
  );
}

function ActionCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card p-4 block">
      <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>{title}</div>
      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{desc}</div>
    </Link>
  );
}

function ProfileCard({
  name, track, lesson, progress, weekly,
}: {
  name: string; track: string; lesson: string; progress: number; weekly?: string;
}) {
  const initial = (name && name.length > 0) ? name[0].toUpperCase() : "S";
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
            {initial}
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{name}</div>
            <div className="badge badge-accent mt-1" style={{ fontSize: "10px", padding: "2px 8px" }}>{track}</div>
          </div>
        </div>
        {weekly ? (
          <div className="text-right">
            <div className="text-sm font-bold" style={{ color: "var(--accent)" }}>{weekly}</div>
            <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>classes/wk</div>
          </div>
        ) : null}
      </div>

      <div className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>{lesson}</div>

      {/* Progress bar */}
      <div className="flex items-center gap-2.5">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-secondary)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: "var(--accent)" }}
          />
        </div>
        <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>{progress}%</span>
      </div>
    </div>
  );
}
