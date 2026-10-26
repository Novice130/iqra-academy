/**
 * @fileoverview Admin CSV exports.
 *
 * RBAC: ORG_ADMIN and above. An ORG_ADMIN exports their own org; a
 * SUPER_ADMIN exports every org, the same rule the admin pages read by.
 *
 * GET /api/admin/exports?type=&from=&to=&status=&tz=
 *   type    students | users | sessions | attendance | invoices
 *   from/to YYYY-MM-DD, inclusive, read as calendar days in `tz`
 *           (sessions, attendance, invoices; default the last 30 days)
 *   status  invoices only; OVERDUE also catches OPEN invoices past due
 *   tz      the viewer's IANA zone; times in the file are shown in it
 *
 * Every cell goes through lib/csv.ts: the old version joined raw values with
 * commas, so a family name with a comma shifted every column after it and a
 * name starting with "=" ran as a formula in Excel.
 *
 * Files stop at ROW_CAP rows. When that happens the filename ends in
 * "-truncated" so it is visible on the downloaded file itself, and the
 * response carries X-Export-Truncated.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, desc, eq, gte, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, withDb } from "@/lib/db";
import { invoices, organizations, sessions, studentProfiles, users, bookings, defaultWeeklySlots } from "@/db/schema";
import { requireRole, type AuthContext } from "@/lib/rbac";
import { handleApiError, BusinessRuleError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { toCsv, type CsvValue } from "@/lib/csv";
import { getAttendanceReport } from "@/lib/attendance";
import { zonedDayParts, zonedWallClockToInstant } from "@/lib/slots";
import { isValidZone } from "@/lib/zones";

const ROW_CAP = 50_000;
/** A year is the most one file covers; attendance is assembled in memory. */
const MAX_SPAN_DAYS = 366;
const DEFAULT_SPAN_DAYS = 30;

const TYPES = ["students", "users", "sessions", "attendance", "invoices"] as const;
type ExportType = (typeof TYPES)[number];
const RANGED: ReadonlySet<ExportType> = new Set(["sessions", "attendance", "invoices"]);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const querySchema = z.object({
  type: z.enum(TYPES),
  from: day.optional(),
  to: day.optional(),
  status: z.enum(["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE", "OVERDUE"]).optional(),
  tz: z.string().max(64).optional(),
});

interface Range {
  from: string;
  to: string;
  start: Date;
  /** Exclusive: the start of the day after `to`. */
  end: Date;
}

interface Dataset {
  header: string[];
  rows: CsvValue[][];
}

function scope(ctx: AuthContext, column: PgColumn): SQL | undefined {
  return ctx.role === "SUPER_ADMIN" ? undefined : eq(column, ctx.orgId);
}

function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dayStart(key: string, zone: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return zonedWallClockToInstant(y, m, d, 0, 0, zone);
}

function resolveRange(from: string | undefined, to: string | undefined, zone: string): Range {
  const today = zonedDayParts(new Date(), zone);
  const todayKey = `${today.y}-${String(today.m).padStart(2, "0")}-${String(today.d).padStart(2, "0")}`;
  const toKey = to ?? todayKey;
  const fromKey = from ?? shiftDay(toKey, -(DEFAULT_SPAN_DAYS - 1));
  if (fromKey > toKey) throw new BusinessRuleError("The start date is after the end date.");
  const span = (Date.parse(toKey) - Date.parse(fromKey)) / 86_400_000 + 1;
  if (span > MAX_SPAN_DAYS) throw new BusinessRuleError(`Pick ${MAX_SPAN_DAYS} days or fewer.`);
  return { from: fromKey, to: toKey, start: dayStart(fromKey, zone), end: dayStart(shiftDay(toKey, 1), zone) };
}

/** "2026-10-01 16:30" in the export's zone, or blank. */
function localStamp(value: Date | string | null | undefined, zone: string): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const p: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  for (const { type, value: v } of fmt.formatToParts(date)) p[type] = v;
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

async function students(ctx: AuthContext): Promise<Dataset> {
  const teachers = sql<string | null>`(
    select string_agg(distinct t.name, '; ')
    from ${defaultWeeklySlots} w join ${users} t on t.id = w.teacher_id
    where w.student_profile_id = ${studentProfiles.id} and w.is_active)`;
  const rows = await db
    .select({
      id: studentProfiles.id, name: studentProfiles.name, track: studentProfiles.track,
      level: studentProfiles.currentLevel, familyId: users.id, familyName: users.name,
      familyEmail: users.email, familyPhone: users.phone, teachers, createdAt: studentProfiles.createdAt,
    })
    .from(studentProfiles)
    .innerJoin(users, eq(users.id, studentProfiles.userId))
    .where(and(scope(ctx, studentProfiles.orgId), isNull(users.deletedAt)))
    .orderBy(asc(users.name), asc(studentProfiles.name))
    .limit(ROW_CAP + 1);
  return {
    header: ["Profile ID", "Student", "Track", "Level", "Family ID", "Family", "Family email", "Family phone", "Teachers", "Created (UTC)"],
    rows: rows.map((r) => [r.id, r.name, r.track, r.level, r.familyId, r.familyName, r.familyEmail, r.familyPhone, r.teachers, r.createdAt]),
  };
}

async function usersExport(ctx: AuthContext): Promise<Dataset> {
  const rows = await db
    .select({
      id: users.id, name: users.name, email: users.email, role: users.role,
      phone: users.phone, timezone: users.timezone, verified: users.emailVerified, createdAt: users.createdAt,
    })
    .from(users)
    .where(and(scope(ctx, users.orgId), isNull(users.deletedAt)))
    .orderBy(asc(users.name))
    .limit(ROW_CAP + 1);
  return {
    header: ["ID", "Name", "Email", "Role", "Phone", "Time zone", "Email verified", "Created (UTC)"],
    rows: rows.map((r) => [r.id, r.name, r.email, r.role, r.phone, r.timezone, r.verified, r.createdAt]),
  };
}

async function sessionsExport(ctx: AuthContext, range: Range, zone: string): Promise<Dataset> {
  const booked = sql<number>`(select count(*)::int from ${bookings} b where b.session_id = ${sessions.id} and b.status <> 'CANCELLED')`;
  const rows = await db
    .select({
      id: sessions.id, start: sessions.scheduledStart, end: sessions.scheduledEnd, title: sessions.title,
      type: sessions.type, status: sessions.status, track: sessions.track, isTrial: sessions.isTrial,
      teacher: users.name, booked,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.teacherId))
    .where(and(
      scope(ctx, sessions.orgId),
      gte(sessions.scheduledStart, range.start),
      lt(sessions.scheduledStart, range.end),
      isNull(sessions.mergedIntoId)
    ))
    .orderBy(asc(sessions.scheduledStart))
    .limit(ROW_CAP + 1);
  return {
    header: ["Session ID", `Start (${zone})`, `End (${zone})`, "Minutes", "Title", "Type", "Status", "Track", "Trial", "Teacher", "Students booked"],
    rows: rows.map((r) => [
      r.id, localStamp(r.start, zone), localStamp(r.end, zone),
      Math.round((r.end.getTime() - r.start.getTime()) / 60_000),
      r.title, r.type, r.status, r.track, r.isTrial, r.teacher, r.booked,
    ]),
  };
}

async function attendanceExport(ctx: AuthContext, range: Range, zone: string): Promise<Dataset> {
  const orgIds = ctx.role === "SUPER_ADMIN"
    ? (await db.select({ id: organizations.id }).from(organizations).where(isNull(organizations.deletedAt))).map((o) => o.id)
    : [ctx.orgId];
  const rows: CsvValue[][] = [];
  for (const orgId of orgIds) {
    // getAttendanceReport's upper bound is inclusive.
    const report = await getAttendanceReport({ orgId, from: range.start, to: new Date(range.end.getTime() - 1) });
    for (const occ of [...report].reverse()) {
      const people = [...(occ.teacher ? [occ.teacher] : []), ...occ.students, ...occ.observers];
      for (const p of people) {
        rows.push([
          occ.sessionId, occ.title, localStamp(occ.scheduledStart, zone), occ.status, occ.teacherName,
          p.name, p.role, p.status, localStamp(p.firstJoinedAt, zone), localStamp(p.lastLeftAt, zone),
          p.durationSeconds === null ? "" : Math.round(p.durationSeconds / 60),
          p.lateBySeconds === null ? "" : Math.round(p.lateBySeconds / 60),
          p.connections,
        ]);
        if (rows.length > ROW_CAP) break;
      }
      if (rows.length > ROW_CAP) break;
    }
  }
  return {
    header: ["Session ID", "Class", `Start (${zone})`, "Class status", "Teacher", "Person", "Role", "Attendance",
      `Joined (${zone})`, `Left (${zone})`, "Minutes in class", "Minutes late", "Connections"],
    rows,
  };
}

async function invoicesExport(ctx: AuthContext, range: Range, zone: string, status?: string): Promise<Dataset> {
  const now = new Date();
  const statusCond =
    status === "OVERDUE"
      ? or(eq(invoices.status, "OVERDUE"), and(eq(invoices.status, "OPEN"), lt(invoices.dueDate, now)))
      : status ? eq(invoices.status, status as (typeof invoices.status.enumValues)[number]) : undefined;
  const rows = await db
    .select({
      id: invoices.id, family: users.name, email: users.email, status: invoices.status,
      due: invoices.amountDueCents, paid: invoices.amountPaidCents, currency: invoices.currency,
      createdAt: invoices.createdAt, dueDate: invoices.dueDate, paidAt: invoices.paidAt,
      periodStart: invoices.periodStart, periodEnd: invoices.periodEnd,
      stripeInvoiceId: invoices.stripeInvoiceId, notes: invoices.notes,
    })
    .from(invoices)
    .innerJoin(users, eq(users.id, invoices.userId))
    .where(and(scope(ctx, invoices.orgId), gte(invoices.createdAt, range.start), lt(invoices.createdAt, range.end), statusCond))
    .orderBy(desc(invoices.createdAt))
    .limit(ROW_CAP + 1);
  return {
    header: ["Invoice ID", "Family", "Email", "Status", "Overdue", "Amount due", "Amount paid", "Currency",
      `Issued (${zone})`, `Due (${zone})`, `Paid (${zone})`, `Period start (${zone})`, `Period end (${zone})`, "Source", "Notes"],
    rows: rows.map((r) => [
      r.id, r.family, r.email, r.status,
      r.status === "OVERDUE" || (r.status === "OPEN" && !!r.dueDate && r.dueDate < now),
      dollars(r.due), dollars(r.paid), r.currency.toUpperCase(),
      localStamp(r.createdAt, zone), localStamp(r.dueDate, zone), localStamp(r.paidAt, zone),
      localStamp(r.periodStart, zone), localStamp(r.periodEnd, zone),
      r.stripeInvoiceId ? "Stripe" : "Manual", r.notes,
    ]),
  };
}

/** GET /api/admin/exports — one dataset as a CSV download. */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      const zone = q.tz && isValidZone(q.tz) ? q.tz : "UTC";
      const range = RANGED.has(q.type) ? resolveRange(q.from, q.to, zone) : null;

      let data: Dataset;
      switch (q.type) {
        case "students": data = await students(ctx); break;
        case "users": data = await usersExport(ctx); break;
        case "sessions": data = await sessionsExport(ctx, range!, zone); break;
        case "attendance": data = await attendanceExport(ctx, range!, zone); break;
        case "invoices": data = await invoicesExport(ctx, range!, zone, q.status); break;
      }

      const truncated = data.rows.length > ROW_CAP;
      const rows = truncated ? data.rows.slice(0, ROW_CAP) : data.rows;
      const stamp = range ? `${range.from}-to-${range.to}` : new Date().toISOString().slice(0, 10);
      const filename = `${q.type}${q.status ? `-${q.status.toLowerCase()}` : ""}-${stamp}${truncated ? "-truncated" : ""}.csv`;

      await logAudit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "EXPORT_GENERATED",
        target: `export:${q.type}`,
        metadata: {
          type: q.type, from: range?.from ?? null, to: range?.to ?? null,
          status: q.status ?? null, rows: rows.length, truncated, zone,
        },
        ipAddress: getClientIp(request.headers),
      });

      return new NextResponse(toCsv(data.header, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          "X-Export-Rows": String(rows.length),
          "X-Export-Truncated": String(truncated),
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
