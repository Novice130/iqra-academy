import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, withDb } from "@/lib/db";
import { eq, and, gte, lte, asc, sql } from "drizzle-orm";
import { bookings, sessions, users as usersTable } from "@/db/schema";
import { startOfWeek, addDays } from "date-fns";
import Link from "next/link";
import WeekGrid, { type WeekBooking } from "./WeekGrid";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function SchedulePage({ searchParams }: Props) {
  return withDb(async () => {
  const p = await searchParams;
  const weekOffset = parseInt(p.week || "0", 10);
  
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) return null;

  const user = session.user as unknown as { id: string; orgId: string };

  // Week range, padded by two days on each side. The exact week boundary is
  // resolved in the browser (WeekGrid) because the server runs in UTC and a
  // class at the edge of the week belongs to a different day depending on
  // where the viewer is.
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });
  const weekStart = addDays(currentWeekStart, weekOffset * 7 - 2);
  const weekEnd = addDays(weekStart, 10);
  weekEnd.setHours(23, 59, 59, 999);

  // 1. Fetch real bookings for this week
  const weekBookings = await db
    .select({
      id: bookings.id,
      studentName: sql<string>`(select name from student_profiles where id = ${bookings.studentProfileId})`,
      studentId: bookings.studentProfileId,
      track: sessions.track,
      title: sessions.title,
      teacherName: usersTable.name,
      start: sessions.scheduledStart,
      id_session: sessions.id,
    })
    .from(bookings)
    .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
    .innerJoin(usersTable, eq(sessions.teacherId, usersTable.id))
    .where(
      and(
        eq(bookings.userId, user.id),
        eq(bookings.status, "CONFIRMED"),
        gte(sessions.scheduledStart, weekStart),
        lte(sessions.scheduledStart, weekEnd)
      )
    )
    .orderBy(asc(sessions.scheduledStart));

  const gridBookings: WeekBooking[] = weekBookings.map((b) => ({
    id: b.id,
    sessionId: b.id_session,
    studentName: b.studentName,
    studentId: b.studentId,
    track: b.track,
    title: b.title,
    start: b.start.toISOString(),
  }));

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Schedule
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Your weekly class calendar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/schedule?week=${weekOffset - 1}`}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            ← Prev
          </Link>
          <Link
            href="/dashboard/schedule?week=0"
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: weekOffset === 0 ? "var(--accent)" : "var(--bg-elevated)", color: weekOffset === 0 ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Today
          </Link>
          <Link
            href={`/dashboard/schedule?week=${weekOffset + 1}`}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Next →
          </Link>
        </div>
      </div>

      <WeekGrid bookings={gridBookings} weekOffset={weekOffset} />
    </div>
  );
  });
}
