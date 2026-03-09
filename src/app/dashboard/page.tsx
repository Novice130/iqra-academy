/**
 * Dashboard Home — Clean, content-first design
 *
 * Generous whitespace, typography-driven, subtle card shadows.
 * Server component reads session for personalized greeting.
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Link from "next/link";

export default async function DashboardPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  const user = session?.user as { name?: string } | undefined;
  const firstName = user?.name?.split(" ")[0] || "there";

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
      <div className="card p-5 mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="badge badge-accent mb-3">Upcoming</div>
            <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Qaidah — Lesson 8
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Connecting Letters • Ustadh Ali Rahman • 30 min
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
              Today at 4:00 PM
            </p>
          </div>
          <Link href="/dashboard/session/demo" className="btn-primary" style={{ fontSize: "13px", padding: "10px 20px" }}>
            Join Class
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="This week" value="1 of 4" sub="classes used" />
        <StatCard label="Completed" value="12" sub="total sessions" />
        <StatCard label="Streak" value="3 wks" sub="consecutive" />
        <StatCard label="Next bill" value="$70" sub="Mar 15" />
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
        <div className="grid lg:grid-cols-2 gap-4">
          <ProfileCard name="Aisha" track="Qaidah" lesson="Lesson 8: Connecting Letters" progress={65} weekly="1/4" />
          <ProfileCard name="Yusuf" track="Quran Reading" lesson="Surah Al-Baqarah: Ayah 1-10" progress={32} weekly="2/4" />
        </div>
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
