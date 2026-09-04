/**
 * @fileoverview Admin Panel Dashboard Page
 *
 * Server-side admin dashboard at /admin.
 * Uses Tailwind CSS design system matching the main application.
 */

import Link from "next/link";
import { canAccessAdmin, adminResources, adminMeta } from "@/lib/admin";
import { db, withDb } from "@/lib/db";
import { sessions } from "@/db/schema";
import { sql, inArray, asc } from "drizzle-orm";
import { getRoomServiceClient } from "@/lib/livekit";
import ScheduledClassesMatrix, { type ScheduledClassItem } from "../ScheduledClassesMatrix";

const TABLE_PAGES: Record<string, string> = {
  users: "/admin/users",
  invoices: "/admin/invoices",
  sessions: "/dashboard/attendance",
};

export default async function AdminPage() {
  return withDb(async () => {
    const tableCounts = await getTableCounts();
    const liveClasses = await getLiveClasses();
    const scheduledClasses = await getScheduledClasses();

    return (
      <div className="space-y-8 animate-fadeIn">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🕌</span>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {adminMeta.title}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                v{adminMeta.version}
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {adminMeta.description} • {adminMeta.totalTables} Database Tables Managed
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/dashboard/teacher"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center gap-1.5"
            >
              <span>⚡</span> Start Instant Meeting
            </Link>
            <Link
              href="/admin/assign-student"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition flex items-center gap-1.5"
            >
              <span>📋</span> Schedule with Teacher
            </Link>
            <Link
              href="/admin/users"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white shadow-sm hover:opacity-95 transition"
            >
              + Add Teacher
            </Link>
            <Link
              href="/admin/invoices"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition"
            >
              Manage Invoices
            </Link>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {tableCounts.map((stat) => (
            <div
              key={stat.label}
              className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-sm hover:border-emerald-500/40 transition flex flex-col justify-between"
            >
              <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
                {stat.count}
              </div>
              <div className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] mt-2">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Live Classes Monitor (Strictly active LiveKit rooms) */}
        <section className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Live Classes Now ({liveClasses.length})
              </h2>
            </div>
            <Link
              href="/dashboard/attendance"
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              View Attendance Log →
            </Link>
          </div>

          <div className="p-6">
            {liveClasses.length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--text-secondary)]">
                No classes currently running on LiveKit.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {liveClasses.map((room) => (
                  <div
                    key={room.name}
                    className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="font-semibold text-sm text-[var(--text-primary)] truncate">
                        {room.session ? (room.session.title || room.session.track || "Quran Class") : room.name}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-1">
                        {room.session ? `Teacher: ${room.session.teacherName}` : "Direct LiveKit Room"}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border)] text-xs">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                        {room.numParticipants} online
                      </span>
                      {room.session && (
                        <Link
                          href={`/dashboard/session/${room.session.id}`}
                          className="font-semibold text-[var(--accent)] hover:underline"
                        >
                          Join/Inspect →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Scheduled Classes Matrix (Dates x Teachers tabular format) */}
        <ScheduledClassesMatrix classes={scheduledClasses} />

        {/* Quick Admin Actions */}
        <section className="space-y-4">
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>⚡</span> Quick Management Tools
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/admin/users"
              className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-emerald-500/50 shadow-sm transition group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg">
                  👥
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-emerald-600 transition">
                    People & Roles
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Promote users to teacher, manage roles and permissions
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/invoices"
              className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-emerald-500/50 shadow-sm transition group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg">
                  💳
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-blue-600 transition">
                    Invoices & Payments
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Issue invoices, record manual wire payments, track status
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/attendance"
              className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-emerald-500/50 shadow-sm transition group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-lg">
                  📋
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-purple-600 transition">
                    Attendance & Class Log
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Inspect class history, teacher duration, and attendee records
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Database Tables & Schema Resources */}
        <section className="space-y-6">
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>🗄️</span> Database Tables & Schema
          </h2>

          <div className="space-y-6">
            {Object.entries(adminResources).map(([key, group]) => (
              <div key={key} className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {group.navigation}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {group.tables.map((table) => {
                    const href = TABLE_PAGES[table];
                    const label = table.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

                    return href ? (
                      <Link
                        key={table}
                        href={href}
                        className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-emerald-500/30 hover:border-emerald-500 shadow-xs transition group flex flex-col justify-between"
                      >
                        <div className="font-semibold text-xs text-[var(--text-primary)] group-hover:text-emerald-600 transition">
                          {label}
                        </div>
                        <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                          {table} →
                        </div>
                      </Link>
                    ) : (
                      <div
                        key={table}
                        className="p-3.5 rounded-xl bg-[var(--bg-secondary)]/50 border border-[var(--border)] flex flex-col justify-between opacity-80"
                      >
                        <div className="font-medium text-xs text-[var(--text-secondary)]">
                          {label}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-tertiary)] mt-1">
                          {table}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* API Health & Diagnostics */}
        <section className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-semibold text-[var(--text-primary)]">System API Health</span>
            <span className="text-[var(--text-secondary)]">• PostgreSQL connection active</span>
          </div>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            GET /api/health ↗
          </a>
        </section>
      </div>
    );
  });
}

async function getLiveClasses() {
  try {
    const rooms = await getRoomServiceClient().listRooms();
    if (rooms.length === 0) return [];

    const sessionIds = rooms.map((r) => r.name.replace(/^qlms-/, ""));
    const matchedSessions = await db.query.sessions.findMany({
      where: inArray(sessions.id, sessionIds),
      with: { teacher: { columns: { name: true } } },
    });
    const byId = new Map(matchedSessions.map((s) => [s.id, s]));
    const byVideoRoomName = new Map(
      matchedSessions.filter((s) => s.videoRoomName).map((s) => [s.videoRoomName, s])
    );

    return rooms.map((r) => {
      const session = byId.get(r.name.replace(/^qlms-/, "")) || byVideoRoomName.get(r.name);
      return {
        name: r.name,
        numParticipants: r.numParticipants,
        creationTime: r.creationTime ? Number(r.creationTime) * 1000 : null,
        session: session
          ? { id: session.id, title: session.title, track: session.track, teacherName: session.teacher.name }
          : null,
      };
    });
  } catch {
    return [];
  }
}

async function getTableCounts() {
  try {
    const counts = await Promise.all([
      db.execute(sql`SELECT count(*)::int as c FROM organizations`),
      db.execute(sql`SELECT count(*)::int as c FROM users`),
      db.execute(sql`SELECT count(*)::int as c FROM student_profiles`),
      db.execute(sql`SELECT count(*)::int as c FROM subscriptions`),
      db.execute(sql`SELECT count(*)::int as c FROM sessions`),
      db.execute(sql`SELECT count(*)::int as c FROM bookings`),
    ]);

    return [
      { label: "Organizations", count: (counts[0] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Users", count: (counts[1] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Students", count: (counts[2] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Subscriptions", count: (counts[3] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Sessions", count: (counts[4] as unknown as { c: number }[])[0]?.c ?? 0 },
      { label: "Bookings", count: (counts[5] as unknown as { c: number }[])[0]?.c ?? 0 },
    ];
  } catch {
    return [
      { label: "Organizations", count: 0 },
      { label: "Users", count: 0 },
      { label: "Students", count: 0 },
      { label: "Subscriptions", count: 0 },
      { label: "Sessions", count: 0 },
      { label: "Bookings", count: 0 },
    ];
  }
}

async function getScheduledClasses(): Promise<ScheduledClassItem[]> {
  try {
    const upcoming = await db.query.sessions.findMany({
      where: inArray(sessions.status, ["SCHEDULED"]),
      with: {
        teacher: { columns: { name: true, email: true } },
        bookings: {
          with: {
            studentProfile: { columns: { name: true, track: true } },
          },
        },
      },
      orderBy: [asc(sessions.scheduledStart)],
      limit: 50,
    });

    return upcoming.map((s) => ({
      id: s.id,
      title: s.title || "Quran Lesson",
      track: s.track || "QAIDAH",
      teacherName: s.teacher?.name || s.teacher?.email || "Teacher",
      teacherEmail: s.teacher?.email || "",
      scheduledStart: s.scheduledStart ? new Date(s.scheduledStart).toISOString() : new Date().toISOString(),
      scheduledEnd: s.scheduledEnd ? new Date(s.scheduledEnd).toISOString() : new Date().toISOString(),
      students: s.bookings.map((b) => b.studentProfile?.name || "Student").join(", "),
    }));
  } catch {
    return [];
  }
}
