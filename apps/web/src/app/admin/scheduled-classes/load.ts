/**
 * @fileoverview Server-side query for /admin/scheduled-classes: filter in
 * SQL, fold rows into classes, page over classes.
 *
 * Filtering used to happen in the browser over the first 500 rows, so a
 * class past the cap could not be found at all. Now the filters are a WHERE
 * clause and only one page of classes is loaded in full.
 *
 * A class is often several session rows (a group row plus one per student;
 * see lib/class-room.ts), so rows are grouped with `groupIntoOccurrences` —
 * the rule the join API uses — and the page counts and shows classes, not
 * rows. The grouping pass reads only id, teacher and start, which is cheap
 * enough to do over the whole filtered range.
 */

import { and, asc, eq, exists, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, sessions, studentProfiles, users } from "@/db/schema";
import { orgFilter, type AdminContext } from "@/lib/admin-page";
import { groupIntoOccurrences } from "@/lib/class-room";

export interface ClassFilterValues {
  teacher: string;
  track: string;
  status: string;
  window: string;
  q: string;
  page: number;
}

export const PAGE_SIZE = 25;
/** The grouping pass stops here; the page says so if it is ever reached. */
const SCAN_LIMIT = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const TRACKS = ["QAIDAH", "QURAN_READING", "HIFZ"];
const STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"];
const WINDOWS = ["7", "14", "30", "90", "ALL"];

/** Normalise raw searchParams; anything unrecognised falls back to the default. */
export function parseFilters(p: Record<string, string | undefined>): ClassFilterValues {
  return {
    teacher: p.teacher && p.teacher !== "ALL" ? p.teacher : "ALL",
    track: p.track && TRACKS.includes(p.track) ? p.track : "ALL",
    status: p.status && (STATUSES.includes(p.status) || p.status === "ALL") ? p.status : "ACTIVE",
    window: p.window && WINDOWS.includes(p.window) ? p.window : "30",
    q: (p.q ?? "").trim().slice(0, 100),
    page: Math.max(1, parseInt(p.page || "1", 10) || 1),
  };
}

export interface ClassRow {
  /** The canonical row — the one the class page and room are keyed on. */
  id: string;
  rowCount: number;
  title: string;
  track: string;
  origin: string;
  teacherName: string;
  teacherEmail: string;
  studentNames: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
}

export async function loadScheduledClasses(admin: AdminContext, f: ClassFilterValues) {
  const now = Date.now();
  const conditions: (SQL | undefined)[] = [
    orgFilter(admin, sessions.orgId),
    isNull(sessions.mergedIntoId),
    // 24 hours back, as an instant: covers "today" in every viewer's zone.
    gte(sessions.scheduledStart, new Date(now - DAY_MS)),
  ];
  if (f.window !== "ALL") conditions.push(lt(sessions.scheduledStart, new Date(now + Number(f.window) * DAY_MS)));
  if (f.teacher !== "ALL") conditions.push(eq(sessions.teacherId, f.teacher));
  if (f.track !== "ALL") conditions.push(eq(sessions.track, f.track as "QAIDAH"));
  if (f.status === "ACTIVE") conditions.push(ne(sessions.status, "CANCELLED"));
  else if (f.status !== "ALL") conditions.push(eq(sessions.status, f.status as "SCHEDULED"));
  if (f.q) {
    const pattern = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(sessions.title, pattern),
        ilike(users.name, pattern),
        exists(
          db
            .select({ one: sql`1` })
            .from(bookings)
            .innerJoin(studentProfiles, eq(bookings.studentProfileId, studentProfiles.id))
            .where(and(eq(bookings.sessionId, sessions.id), ilike(studentProfiles.name, pattern)))
        )
      )
    );
  }

  const keys = await db
    .select({ id: sessions.id, teacherId: sessions.teacherId, scheduledStart: sessions.scheduledStart })
    .from(sessions)
    .innerJoin(users, eq(sessions.teacherId, users.id))
    .where(and(...conditions))
    .orderBy(asc(sessions.scheduledStart), asc(sessions.id))
    .limit(SCAN_LIMIT);

  const occurrences = groupIntoOccurrences(keys).sort(
    (a, b) => new Date(a.canonical.scheduledStart).getTime() - new Date(b.canonical.scheduledStart).getTime()
  );
  const totalPages = Math.max(1, Math.ceil(occurrences.length / PAGE_SIZE));
  const page = Math.min(f.page, totalPages);
  const pageOccurrences = occurrences.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = pageOccurrences.flatMap((o) => o.sessions.map((s) => s.id));

  const rows = ids.length
    ? await db.query.sessions.findMany({
        where: inArray(sessions.id, ids),
        with: {
          teacher: { columns: { name: true, email: true } },
          bookings: { columns: { status: true }, with: { studentProfile: { columns: { name: true, track: true } } } },
        },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const classes: ClassRow[] = pageOccurrences.flatMap((o) => {
    const members = o.sessions.map((s) => byId.get(s.id)).filter((r): r is NonNullable<typeof r> => !!r);
    const canonical = byId.get(o.canonical.id);
    if (!canonical) return [];
    const allBookings = members.flatMap((m) => m.bookings);
    const live = allBookings.filter((b) => b.status !== "CANCELLED");
    const names = [...new Set((live.length ? live : allBookings).map((b) => b.studentProfile?.name).filter(Boolean))];
    const end = Math.max(...members.map((m) => new Date(m.scheduledEnd).getTime()));
    return [
      {
        id: canonical.id,
        rowCount: members.length,
        title: canonical.title || "Quran lesson",
        track: canonical.track || allBookings[0]?.studentProfile?.track || "QAIDAH",
        origin: canonical.origin,
        teacherName: canonical.teacher?.name || canonical.teacher?.email || "Teacher",
        teacherEmail: canonical.teacher?.email || "",
        studentNames: names.join(", "),
        scheduledStart: new Date(canonical.scheduledStart).toISOString(),
        scheduledEnd: new Date(end).toISOString(),
        status: canonical.status,
      },
    ];
  });

  return { classes, page, totalPages, total: occurrences.length, truncated: keys.length === SCAN_LIMIT };
}
