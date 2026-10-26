/**
 * @fileoverview Server-side query for /admin/scheduled-classes: filter in
 * SQL, fold rows into classes, page over classes.
 *
 * Filtering used to happen in the browser over the first 500 rows, so a
 * class past the cap could not be found at all. Now the filters are a WHERE
 * clause and only one page of classes is loaded in full.
 *
 * A class is often several session rows (a group row plus one per student,
 * at the same time), so rows are grouped with `groupClassRows` — the rule the
 * Cancel button and the class page act with — and the page counts and shows
 * classes, not rows. The grouping pass reads only id, teacher and start, which is cheap
 * enough to do over the whole filtered range.
 */

import { and, asc, eq, exists, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, sessions, studentProfiles, users } from "@/db/schema";
import { orgFilter, type AdminContext } from "@/lib/admin-page";
import { groupClassRows } from "@/lib/admin-scheduling";

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
/** Reach around the matched rows far enough to find a class's earlier rows. */
const MARGIN_MS = 6 * 60 * 60 * 1000;

interface KeyRow {
  id: string;
  teacherId: string;
  status: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

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
    .select({ id: sessions.id, teacherId: sessions.teacherId, status: sessions.status, scheduledStart: sessions.scheduledStart, scheduledEnd: sessions.scheduledEnd })
    .from(sessions)
    .innerJoin(users, eq(sessions.teacherId, users.id))
    .where(and(...conditions))
    .orderBy(asc(sessions.scheduledStart), asc(sessions.id))
    .limit(SCAN_LIMIT);

  // The filters pick which classes to show, not which of their rows: a search
  // for one student must still show the whole class, keyed on its canonical
  // row. So every live row of the matched teachers around the matched range
  // is read unfiltered and grouped, and a class is kept if any row matched.
  let groups: { canonical: KeyRow; sessions: KeyRow[] }[] = [];
  if (keys.length > 0) {
    const teacherIds = [...new Set(keys.map((k) => k.teacherId))];
    const from = Math.min(...keys.map((k) => new Date(k.scheduledStart).getTime())) - MARGIN_MS;
    const to = Math.max(...keys.map((k) => new Date(k.scheduledEnd).getTime())) + MARGIN_MS;
    const around = await db
      .select({ id: sessions.id, teacherId: sessions.teacherId, status: sessions.status, scheduledStart: sessions.scheduledStart, scheduledEnd: sessions.scheduledEnd })
      .from(sessions)
      .where(
        and(
          orgFilter(admin, sessions.orgId),
          inArray(sessions.teacherId, teacherIds),
          isNull(sessions.mergedIntoId),
          ne(sessions.status, "CANCELLED"),
          gte(sessions.scheduledStart, new Date(from)),
          lt(sessions.scheduledStart, new Date(to))
        )
      )
      .limit(SCAN_LIMIT * 2);
    const all = new Map<string, KeyRow>([...around, ...keys].map((r) => [r.id, r]));
    const rowsAll = [...all.values()];
    const matched = new Set(keys.map((k) => k.id));
    groups = [
      ...groupClassRows(rowsAll.filter((r) => r.status !== "CANCELLED")),
      ...groupClassRows(rowsAll.filter((r) => r.status === "CANCELLED")),
    ]
      .filter((g) => g.sessions.some((r) => matched.has(r.id)))
      .sort((a, b) => new Date(a.canonical.scheduledStart).getTime() - new Date(b.canonical.scheduledStart).getTime());
  }
  const occurrences = groups;
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
