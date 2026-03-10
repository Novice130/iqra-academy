/**
 * Dashboard Home — Clean, content-first design
 *
 * Generous whitespace, typography-driven, subtle card shadows.
 * Server component reads session for personalized greeting.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { db } from "@/lib/db";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { studentProfiles, bookings, subscriptions, sessions, users } from "@/db/schema";
import { getQuotaStatus } from "@/lib/quota";
import { format } from "date-fns";

export default async function DashboardPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) return null;

  const user = session.user as { id: string; name?: string; orgId: string };
  const firstName = user.name?.split(" ")[0] || "there";

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

  const upcoming = upcomingBookings[0];

  // 3. Get Subscription & Quota
  const subscription = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, user.id), eq(subscriptions.status, "ACTIVE")),
    with: { plan: true },
  });

  const quota = subscription
    ? await getQuotaStatus(subscription.id, user.id, user.orgId)
    : { used: 0, totalAllowed: 0, remaining: 0 };

  // 4. Calculate total sessions completed
  const [sessionCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.userId, user.id), eq(bookings.status, "COMPLETED")));

  const totalCompleted = sessionCount?.count ?? 0;

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
                {upcoming.sessions.track ? (upcoming.sessions.track.charAt(0) + upcoming.sessions.track.slice(1).toLowerCase()) : "Quran Class"} — {upcoming.sessions.title || "Lesson"}
              </h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Ustadh {upcoming.users?.name || "Teacher"} • 30 min
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                {format(upcoming.sessions.scheduledStart, "EEEE 'at' h:mm a")}
              </p>
            </div>
            <Link href={`/dashboard/session/${upcoming.sessions.id}`} className="btn-primary" style={{ fontSize: "13px", padding: "10px 20px" }}>
              Join Class
            </Link>
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
        <StatCard label="Streak" value="--" sub="coming soon" />
        <StatCard label="Next bill" value={subscription ? `$${subscription.plan.priceInCents / 100}` : "--"} sub={subscription ? format(subscription.currentPeriodEnd, "MMM d") : "No plan"} />
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
              return (
                <ProfileCard
                  key={profile.id}
                  name={profile.name}
                  track={profile.track.charAt(0) + profile.track.slice(1).toLowerCase()}
                  lesson={latestRecord?.lesson?.title || "Beginning track..."}
                  progress={latestRecord ? 50 : 0} // Placeholder for real % calculation
                  weekly="--"
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

function ProfileCard({ name, track, lesson, progress, weekly }: {
  name: string; track: string; lesson: string; progress: number; weekly: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
            {name[0]}
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{name}</div>
            <div className="badge badge-accent mt-1" style={{ fontSize: "10px", padding: "2px 8px" }}>{track}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold" style={{ color: "var(--accent)" }}>{weekly}</div>
          <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>classes/wk</div>
        </div>
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
