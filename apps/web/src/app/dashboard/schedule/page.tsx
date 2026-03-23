import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { bookings, sessions, users as usersTable } from "@/db/schema";
import { startOfWeek, addDays, format, isValid, parseISO } from "date-fns";
import Link from "next/link";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function SchedulePage({ searchParams }: Props) {
  const p = await searchParams;
  const weekOffset = parseInt(p.week || "0", 10);
  
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) return null;

  const user = session.user as { id: string; orgId: string };

  // Calculate week range
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });
  const weekStart = addDays(currentWeekStart, weekOffset * 7);
  const weekEnd = addDays(weekStart, 6);
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

  const weekDates = DAYS.map((_, i) => addDays(weekStart, i));

  const isToday = (date: Date) =>
    date.toDateString() === today.toDateString();

  // Color mapping based on student ID to keep colors consistent
  const getStudentColor = (id: string | null) => {
    if (!id) return "var(--accent)";
    const colors = ["#5C7C6F", "#C9A962", "#7C5C64", "#5C647C", "#7C745C"];
    const index = Math.abs(id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
    return colors[index];
  };

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

      {/* Calendar grid */}
      <div className="card overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-8" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="p-3" style={{ borderRight: "1px solid var(--border)" }} />
          {weekDates.map((date, i) => (
            <div
              key={i}
              className="p-3 text-center"
              style={{
                borderRight: i < 6 ? "1px solid var(--border)" : undefined,
                background: isToday(date) ? "var(--accent)" : undefined,
                color: isToday(date) ? "#fff" : "var(--text-primary)",
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ opacity: isToday(date) ? 1 : 0.5 }}>
                {DAYS[i]}
              </div>
              <div className="text-lg font-bold mt-0.5">{date.getDate()}</div>
            </div>
          ))}
        </div>

        {/* Time slots */}
        {HOURS.map((hour) => (
          <div key={hour} className="grid grid-cols-8" style={{ borderBottom: "1px solid var(--border)", minHeight: 64 }}>
            <div className="p-2 text-xs font-medium text-right pr-3 pt-3" style={{ color: "var(--text-tertiary)", borderRight: "1px solid var(--border)" }}>
              {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
            </div>
            {DAYS.map((_, dayIndex) => {
              // Find bookings at this hour/day
              const bookingsAtSlot = weekBookings.filter(b => {
                const date = b.start;
                return date.getDay() === dayIndex && date.getHours() === hour;
              });

              return (
                <div
                  key={dayIndex}
                  className="p-1 relative min-h-[64px]"
                  style={{ borderRight: dayIndex < 6 ? "1px solid var(--border)" : undefined }}
                >
                  {bookingsAtSlot.map(booking => (
                    <div
                      key={booking.id}
                      className="rounded-lg p-2 text-white text-[10px] cursor-pointer transition-transform hover:scale-[1.02] mb-1 leading-tight shadow-sm"
                      style={{ background: getStudentColor(booking.studentId) }}
                    >
                      <div className="font-bold truncate">{booking.studentName}</div>
                      <div className="truncate opacity-90">{booking.track ? booking.track.toLowerCase() : "lesson"}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
