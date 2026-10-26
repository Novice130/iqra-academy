/**
 * @fileoverview Read models for /admin/students, /admin/students/[id] and
 * /admin/trials.
 *
 * A "student" here is a studentProfiles row — the learner — not the users row,
 * which is the family account that pays and may hold several children. Every
 * per-student number is keyed on the profile; billing is keyed on the family
 * account because that is who an invoice is addressed to.
 *
 * The list is one query per aggregate (next class, last class, teacher,
 * attendance, unpaid invoices) grouped over the whole org, rather than a query
 * per row. The previous staff list ran two queries per student and was the
 * slowest page in the dashboard.
 *
 * Every instant leaves this module as an ISO string. The server runs in UTC
 * and formats nothing; LocalTime renders in the viewer's zone.
 *
 * @module lib/admin-students
 */

import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLogs,
  bookings,
  defaultWeeklySlots,
  invoices,
  lessonContent,
  observerEmails,
  progressRecords,
  sessionAttendance,
  sessions,
  studentProfiles,
  subscriptions,
  teacherFeedback,
  users,
} from "@/db/schema";
import { orgFilter, type AdminContext } from "@/lib/admin-page";
import { getAttendanceReport, type AttendanceStatus } from "@/lib/attendance";
import { getQuotaStatus, isPerChildPlan } from "@/lib/quota";
import {
  TRIAL_FOLLOW_UPS,
  TRIAL_FOLLOW_UP_OP,
  type TrialFollowUp,
  type TrialStage,
} from "@/app/admin/trials/stages";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNPAID = ["OPEN", "OVERDUE"] as const;

/** An OPEN invoice past its due date is overdue whether or not a job has re-flagged it yet. */
function isOverdue(status: string, dueDate: Date | null, now: Date): boolean {
  return status === "OVERDUE" || (status === "OPEN" && !!dueDate && dueDate < now);
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ─── List ───────────────────────────────────────────────────────────────────

export interface StudentListRow {
  id: string;
  name: string;
  track: string;
  joinedAt: string;
  familyUserId: string;
  parentName: string;
  parentEmail: string;
  teacherId: string | null;
  teacherName: string | null;
  /** Where the teacher came from: the weekly slot, or failing that the latest booked class. */
  teacherSource: "slot" | "recent" | null;
  nextClassAt: string | null;
  lastClassAt: string | null;
  attended30d: number;
  /** Worst unpaid invoice state on the family account, or null when paid up. */
  billing: "OVERDUE" | "OPEN" | null;
}

export async function loadStudentList(admin: AdminContext): Promise<StudentListRow[]> {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const liveBooking = ne(bookings.status, "CANCELLED");

  const [profiles, nextRows, lastRows, teacherRows, slotRows, attendedRows, unpaidRows] = await Promise.all([
    db
      .select({
        id: studentProfiles.id,
        name: studentProfiles.name,
        track: studentProfiles.track,
        createdAt: studentProfiles.createdAt,
        userId: studentProfiles.userId,
        parentName: users.name,
        parentEmail: users.email,
      })
      .from(studentProfiles)
      .innerJoin(users, eq(users.id, studentProfiles.userId))
      .where(and(orgFilter(admin, studentProfiles.orgId), isNull(users.deletedAt)))
      .orderBy(asc(studentProfiles.name)),
    db
      .select({
        profileId: bookings.studentProfileId,
        at: sql<Date>`min(${sessions.scheduledStart})`.mapWith(sessions.scheduledStart),
      })
      .from(bookings)
      .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
      .where(
        and(
          orgFilter(admin, bookings.orgId),
          isNotNull(bookings.studentProfileId),
          liveBooking,
          inArray(sessions.status, ["SCHEDULED", "IN_PROGRESS"]),
          gt(sessions.scheduledEnd, now)
        )
      )
      .groupBy(bookings.studentProfileId),
    db
      .select({
        profileId: bookings.studentProfileId,
        at: sql<Date>`max(${sessions.scheduledStart})`.mapWith(sessions.scheduledStart),
      })
      .from(bookings)
      .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
      .where(
        and(
          orgFilter(admin, bookings.orgId),
          isNotNull(bookings.studentProfileId),
          liveBooking,
          ne(sessions.status, "CANCELLED"),
          lte(sessions.scheduledStart, now)
        )
      )
      .groupBy(bookings.studentProfileId),
    // Latest teacher per profile, for students with no weekly slot. Grouped by
    // (profile, teacher) and reduced below — small, and avoids DISTINCT ON.
    db
      .select({
        profileId: bookings.studentProfileId,
        teacherId: sessions.teacherId,
        teacherName: users.name,
        at: sql<Date>`max(${sessions.scheduledStart})`.mapWith(sessions.scheduledStart),
      })
      .from(bookings)
      .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
      .innerJoin(users, eq(users.id, sessions.teacherId))
      .where(
        and(
          orgFilter(admin, bookings.orgId),
          isNotNull(bookings.studentProfileId),
          liveBooking,
          ne(sessions.status, "CANCELLED")
        )
      )
      .groupBy(bookings.studentProfileId, sessions.teacherId, users.name),
    db
      .select({
        profileId: defaultWeeklySlots.studentProfileId,
        teacherId: defaultWeeklySlots.teacherId,
        teacherName: users.name,
        track: defaultWeeklySlots.track,
      })
      .from(defaultWeeklySlots)
      .innerJoin(users, eq(users.id, defaultWeeklySlots.teacherId))
      .where(and(orgFilter(admin, defaultWeeklySlots.orgId), eq(defaultWeeklySlots.isActive, true))),
    db
      .select({
        profileId: sessionAttendance.studentProfileId,
        n: sql<number>`count(distinct ${sessionAttendance.sessionId})::int`,
      })
      .from(sessionAttendance)
      .where(
        and(
          orgFilter(admin, sessionAttendance.orgId),
          eq(sessionAttendance.role, "STUDENT"),
          isNotNull(sessionAttendance.studentProfileId),
          gte(sessionAttendance.joinedAt, since30)
        )
      )
      .groupBy(sessionAttendance.studentProfileId),
    db
      .select({ userId: invoices.userId, status: invoices.status, dueDate: invoices.dueDate })
      .from(invoices)
      .where(and(orgFilter(admin, invoices.orgId), inArray(invoices.status, [...UNPAID]))),
  ]);

  const next = new Map(nextRows.map((r) => [r.profileId, r.at]));
  const last = new Map(lastRows.map((r) => [r.profileId, r.at]));
  const attended = new Map(attendedRows.map((r) => [r.profileId, r.n]));

  const recentTeacher = new Map<string, { id: string; name: string; at: number }>();
  for (const r of teacherRows) {
    if (!r.profileId) continue;
    const at = r.at?.getTime() ?? 0;
    const prev = recentTeacher.get(r.profileId);
    if (!prev || at > prev.at) recentTeacher.set(r.profileId, { id: r.teacherId, name: r.teacherName, at });
  }

  const slots = new Map<string, typeof slotRows>();
  for (const s of slotRows) {
    const list = slots.get(s.profileId);
    if (list) list.push(s);
    else slots.set(s.profileId, [s]);
  }

  const billing = new Map<string, "OVERDUE" | "OPEN">();
  for (const inv of unpaidRows) {
    if (isOverdue(inv.status, inv.dueDate, now)) billing.set(inv.userId, "OVERDUE");
    else if (!billing.has(inv.userId)) billing.set(inv.userId, "OPEN");
  }

  return profiles.map((p) => {
    const own = slots.get(p.id) ?? [];
    // One slot per track; prefer the one for the track the child is on now.
    const slot = own.find((s) => s.track === p.track) ?? own[0];
    const recent = recentTeacher.get(p.id);
    return {
      id: p.id,
      name: p.name,
      track: p.track,
      joinedAt: p.createdAt.toISOString(),
      familyUserId: p.userId,
      parentName: p.parentName,
      parentEmail: p.parentEmail,
      teacherId: slot?.teacherId ?? recent?.id ?? null,
      teacherName: slot?.teacherName ?? recent?.name ?? null,
      teacherSource: slot ? "slot" : recent ? "recent" : null,
      nextClassAt: iso(next.get(p.id)),
      lastClassAt: iso(last.get(p.id)),
      attended30d: attended.get(p.id) ?? 0,
      billing: billing.get(p.userId) ?? null,
    };
  });
}

// ─── 360 view ───────────────────────────────────────────────────────────────

export interface StudentClassRow {
  sessionId: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  sessionStatus: string;
  bookingStatus: string;
  teacherName: string;
  isTrial: boolean;
  /** Null for classes not yet over, cancelled ones, or ones outside the report window. */
  attendance: AttendanceStatus | null;
  lateMinutes: number | null;
}

export interface StudentAttendanceSummary {
  windowDays: number;
  expected: number;
  present: number;
  late: number;
  absent: number;
  /** 0–100, or null when nothing was expected. */
  rate: number | null;
}

const STATS_WINDOW_DAYS = 90;

/** Booked classes for one profile, joined to session and teacher. */
function bookedClasses() {
  return db
    .select({
      sessionId: sessions.id,
      title: sessions.title,
      startsAt: sessions.scheduledStart,
      endsAt: sessions.scheduledEnd,
      sessionStatus: sessions.status,
      bookingStatus: bookings.status,
      teacherId: sessions.teacherId,
      teacherName: users.name,
      isTrial: sessions.isTrial,
    })
    .from(bookings)
    .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
    .innerJoin(users, eq(users.id, sessions.teacherId))
    .$dynamic();
}

/**
 * Attendance per booked class, read through lib/attendance's report so a
 * class spread over a group row and per-student rows is judged the same way
 * the attendance page judges it. One report per teacher the child has had in
 * the window — normally one or two — rather than the whole org's.
 */
async function attendanceFor(
  orgId: string,
  profileId: string,
  familyUserId: string,
  classes: { sessionId: string; teacherId: string }[],
  from: Date,
  to: Date
) {
  const teacherIds = [...new Set(classes.map((c) => c.teacherId))];
  const reports = await Promise.all(
    teacherIds.map((teacherId) => getAttendanceReport({ orgId, teacherId, from, to }))
  );
  const bySession = new Map<string, { status: AttendanceStatus; lateMinutes: number | null }>();
  for (const occ of reports.flat()) {
    // Siblings share a family login and the report keys people by login, so
    // fall back to the account when the profile itself isn't on the roster.
    const person =
      occ.students.find((s) => s.studentProfileId === profileId) ??
      occ.students.find((s) => s.userId === familyUserId);
    if (!person) continue;
    const lateMinutes =
      person.status === "LATE" && person.lateBySeconds ? Math.round(person.lateBySeconds / 60) : null;
    for (const id of occ.sessionIds) bySession.set(id, { status: person.status, lateMinutes });
  }
  return bySession;
}

export async function loadStudent360(admin: AdminContext, profileId: string) {
  const profile = await db.query.studentProfiles.findFirst({
    where: eq(studentProfiles.id, profileId),
    with: {
      user: { columns: { id: true, name: true, email: true, phone: true, timezone: true, createdAt: true, deletedAt: true } },
    },
  });
  if (!profile) return null;
  if (!admin.isSuperAdmin && profile.orgId !== admin.orgId) return null;

  const now = new Date();
  const familyUserId = profile.userId;
  const orgId = profile.orgId;
  const forProfile = and(eq(bookings.studentProfileId, profileId), eq(bookings.orgId, orgId));

  const [siblings, slots, upcoming, recent, statsRows, invoiceRows, observers, progress, feedback, lessonTotals, completedRows, subscription] =
    await Promise.all([
      db
        .select({ id: studentProfiles.id, name: studentProfiles.name, track: studentProfiles.track })
        .from(studentProfiles)
        .where(and(eq(studentProfiles.userId, familyUserId), ne(studentProfiles.id, profileId)))
        .orderBy(asc(studentProfiles.name)),
      db
        .select({
          id: defaultWeeklySlots.id,
          teacherId: defaultWeeklySlots.teacherId,
          teacherName: users.name,
          track: defaultWeeklySlots.track,
          dayOfWeek: defaultWeeklySlots.dayOfWeek,
          startTime: defaultWeeklySlots.startTime,
          timezone: defaultWeeklySlots.timezone,
          isActive: defaultWeeklySlots.isActive,
        })
        .from(defaultWeeklySlots)
        .innerJoin(users, eq(users.id, defaultWeeklySlots.teacherId))
        .where(eq(defaultWeeklySlots.studentProfileId, profileId)),
      bookedClasses()
        .where(
          and(
            forProfile,
            ne(bookings.status, "CANCELLED"),
            inArray(sessions.status, ["SCHEDULED", "IN_PROGRESS"]),
            gt(sessions.scheduledEnd, now)
          )
        )
        .orderBy(asc(sessions.scheduledStart))
        .limit(10),
      bookedClasses()
        .where(and(forProfile, lte(sessions.scheduledStart, now)))
        .orderBy(desc(sessions.scheduledStart))
        .limit(15),
      bookedClasses().where(
        and(
          forProfile,
          gte(sessions.scheduledStart, new Date(now.getTime() - STATS_WINDOW_DAYS * DAY_MS)),
          lte(sessions.scheduledEnd, now)
        )
      ),
      db
        .select()
        .from(invoices)
        .where(and(eq(invoices.userId, familyUserId), eq(invoices.orgId, orgId)))
        .orderBy(desc(invoices.createdAt))
        .limit(50),
      db
        .select()
        .from(observerEmails)
        .where(eq(observerEmails.userId, familyUserId))
        .orderBy(asc(observerEmails.email)),
      db
        .select({
          id: progressRecords.id,
          lessonTitle: lessonContent.title,
          isCompleted: progressRecords.isCompleted,
          teacherApproved: progressRecords.teacherApproved,
          teacherNotes: progressRecords.teacherNotes,
          score: progressRecords.score,
          updatedAt: progressRecords.updatedAt,
        })
        .from(progressRecords)
        .leftJoin(lessonContent, eq(lessonContent.id, progressRecords.lessonId))
        .where(eq(progressRecords.studentProfileId, profileId))
        .orderBy(desc(progressRecords.updatedAt))
        .limit(5),
      db
        .select({
          id: teacherFeedback.id,
          teacherName: users.name,
          notes: teacherFeedback.notes,
          transcription: teacherFeedback.transcription,
          audioUrl: teacherFeedback.audioUrl,
          createdAt: teacherFeedback.createdAt,
        })
        .from(teacherFeedback)
        .innerJoin(users, eq(users.id, teacherFeedback.teacherId))
        .where(eq(teacherFeedback.studentProfileId, profileId))
        .orderBy(desc(teacherFeedback.createdAt))
        .limit(5),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(lessonContent)
        .where(
          and(eq(lessonContent.orgId, orgId), eq(lessonContent.track, profile.track), eq(lessonContent.isActive, true))
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(progressRecords)
        .where(and(eq(progressRecords.studentProfileId, profileId), eq(progressRecords.isCompleted, true))),
      db.query.subscriptions.findFirst({
        where: and(eq(subscriptions.userId, familyUserId), eq(subscriptions.orgId, orgId)),
        orderBy: [desc(subscriptions.createdAt)],
        with: { plan: { columns: { name: true, tier: true, classesPerWeek: true } } },
      }),
    ]);

  // getQuotaStatus only counts for an ACTIVE subscription; anything else is
  // reported as zero allowed, which would read as "used up" rather than "none".
  const quota =
    subscription && subscription.status === "ACTIVE"
      ? await getQuotaStatus(
          subscription.id,
          familyUserId,
          orgId,
          isPerChildPlan(subscription.plan.tier) ? profileId : undefined
        )
      : null;

  // The report window has to reach back to the oldest class in "Recent" so
  // every row there can show an attendance status, not only the last 90 days.
  const statsFrom = new Date(now.getTime() - STATS_WINDOW_DAYS * DAY_MS);
  const oldest = recent.at(-1)?.startsAt;
  const from = oldest && oldest < statsFrom ? oldest : statsFrom;
  const attendance = await attendanceFor(orgId, profileId, familyUserId, [...recent, ...statsRows], from, now);

  const toClassRow = (c: (typeof recent)[number]): StudentClassRow => {
    const over = c.endsAt <= now;
    const cancelled = c.sessionStatus === "CANCELLED" || c.bookingStatus === "CANCELLED";
    const a = over && !cancelled ? attendance.get(c.sessionId) : undefined;
    return {
      sessionId: c.sessionId,
      title: c.title,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      sessionStatus: c.sessionStatus,
      bookingStatus: c.bookingStatus,
      teacherName: c.teacherName,
      isTrial: c.isTrial,
      attendance: a?.status ?? (over && !cancelled && c.sessionStatus === "NO_SHOW" ? "ABSENT" : null),
      lateMinutes: a?.lateMinutes ?? null,
    };
  };

  const summary: StudentAttendanceSummary = { windowDays: STATS_WINDOW_DAYS, expected: 0, present: 0, late: 0, absent: 0, rate: null };
  for (const c of statsRows) {
    if (c.sessionStatus === "CANCELLED" || c.bookingStatus === "CANCELLED") continue;
    const a = attendance.get(c.sessionId)?.status ?? (c.sessionStatus === "NO_SHOW" ? "ABSENT" : null);
    // A class the report could not place (e.g. merged away) is left out rather than guessed.
    if (!a) continue;
    summary.expected++;
    if (a === "PRESENT") summary.present++;
    else if (a === "LATE") summary.late++;
    else summary.absent++;
  }
  if (summary.expected > 0) {
    summary.rate = Math.round(((summary.present + summary.late) / summary.expected) * 100);
  }

  const unpaid = invoiceRows.filter((i) => (UNPAID as readonly string[]).includes(i.status));
  const outstandingCents = unpaid.reduce((sum, i) => sum + Math.max(0, i.amountDueCents - i.amountPaidCents), 0);

  return {
    profile: {
      id: profile.id,
      orgId,
      name: profile.name,
      track: profile.track,
      currentLevel: profile.currentLevel,
      notes: profile.notes,
      dateOfBirth: iso(profile.dateOfBirth),
      createdAt: profile.createdAt.toISOString(),
    },
    family: {
      id: familyUserId,
      name: profile.user.name,
      email: profile.user.email,
      phone: profile.user.phone,
      timezone: profile.user.timezone,
      createdAt: profile.user.createdAt.toISOString(),
      deleted: !!profile.user.deletedAt,
    },
    siblings,
    slots,
    upcoming: upcoming.map(toClassRow),
    recent: recent.map(toClassRow),
    attendance: summary,
    billing: {
      invoices: invoiceRows.slice(0, 10).map((i) => ({
        id: i.id,
        status: isOverdue(i.status, i.dueDate, now) ? "OVERDUE" : i.status,
        amountDueCents: i.amountDueCents,
        amountPaidCents: i.amountPaidCents,
        currency: i.currency,
        createdAt: i.createdAt.toISOString(),
        dueDate: iso(i.dueDate),
      })),
      totalInvoices: invoiceRows.length,
      unpaidCount: unpaid.length,
      outstandingCents,
      // Mixed currencies on one family would make a single total wrong.
      outstandingCurrency: unpaid.every((i) => i.currency === unpaid[0]?.currency) ? (unpaid[0]?.currency ?? "usd") : null,
    },
    subscription: subscription
      ? {
          status: subscription.status,
          planName: subscription.plan.name,
          tier: subscription.plan.tier,
          classesPerWeek: subscription.plan.classesPerWeek,
          paymentMethod: subscription.paymentMethod,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    quota: quota ? { totalAllowed: quota.totalAllowed, used: quota.used, remaining: quota.remaining } : null,
    observers: observers.map((o) => ({
      id: o.id,
      email: o.email,
      isActive: o.isActive,
      frequency: o.frequency,
      seesThisStudent: !o.profileIds || o.profileIds.length === 0 || o.profileIds.includes(profileId),
      allProfiles: !o.profileIds || o.profileIds.length === 0,
    })),
    progress: {
      latest: progress.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })),
      completed: completedRows[0]?.n ?? 0,
      totalLessons: lessonTotals[0]?.n ?? 0,
    },
    feedback: feedback.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
  };
}

export type Student360 = NonNullable<Awaited<ReturnType<typeof loadStudent360>>>;

// ─── Trial pipeline ─────────────────────────────────────────────────────────

export interface TrialRow {
  sessionId: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  bookedAt: string;
  sessionStatus: string;
  bookingStatus: string;
  stage: TrialStage;
  teacherName: string;
  track: string | null;
  familyUserId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  /** The profile the trial was for, or the family's only profile. Null when that is ambiguous. */
  profileId: string | null;
  profileName: string | null;
  followUp: { value: TrialFollowUp; at: string; by: string | null; note: string | null } | null;
}

const TRIAL_LIMIT = 500;

/** Latest instant per key. */
function latestBy<T>(rows: T[], key: (r: T) => string, at: (r: T) => Date | null) {
  const out = new Map<string, number>();
  for (const r of rows) {
    const t = at(r)?.getTime();
    if (t === undefined) continue;
    const k = key(r);
    if (t > (out.get(k) ?? -Infinity)) out.set(k, t);
  }
  return out;
}

export async function loadTrialPipeline(admin: AdminContext): Promise<{ rows: TrialRow[]; truncated: boolean }> {
  const now = new Date();
  const trials = await db
    .select({
      sessionId: sessions.id,
      title: sessions.title,
      status: sessions.status,
      startsAt: sessions.scheduledStart,
      endsAt: sessions.scheduledEnd,
      track: sessions.track,
      teacherName: users.name,
      bookingStatus: bookings.status,
      bookedAt: bookings.createdAt,
      userId: bookings.userId,
      profileId: bookings.studentProfileId,
    })
    .from(sessions)
    .innerJoin(bookings, eq(bookings.sessionId, sessions.id))
    .innerJoin(users, eq(users.id, sessions.teacherId))
    .where(and(orgFilter(admin, sessions.orgId), or(eq(sessions.isTrial, true), eq(sessions.origin, "TRIAL"))))
    .orderBy(desc(sessions.scheduledStart))
    .limit(TRIAL_LIMIT + 1);

  const truncated = trials.length > TRIAL_LIMIT;
  const list = trials.slice(0, TRIAL_LIMIT);
  if (list.length === 0) return { rows: [], truncated: false };

  const userIds = [...new Set(list.map((t) => t.userId))];
  const sessionIds = [...new Set(list.map((t) => t.sessionId))];

  const [contacts, profiles, subs, laterBookings, paid, joined, followUps] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(inArray(users.id, userIds)),
    db
      .select({ id: studentProfiles.id, name: studentProfiles.name, track: studentProfiles.track, userId: studentProfiles.userId })
      .from(studentProfiles)
      .where(inArray(studentProfiles.userId, userIds)),
    db
      .select({ userId: subscriptions.userId, at: subscriptions.createdAt })
      .from(subscriptions)
      .where(and(inArray(subscriptions.userId, userIds), ne(subscriptions.status, "CANCELLED"))),
    db
      .select({ userId: bookings.userId, at: bookings.createdAt })
      .from(bookings)
      .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
      .where(
        and(
          inArray(bookings.userId, userIds),
          ne(bookings.status, "CANCELLED"),
          eq(sessions.isTrial, false),
          ne(sessions.origin, "TRIAL")
        )
      ),
    db
      .select({ userId: invoices.userId, at: invoices.paidAt })
      .from(invoices)
      .where(and(inArray(invoices.userId, userIds), eq(invoices.status, "PAID"))),
    db
      .selectDistinct({ sessionId: sessionAttendance.sessionId })
      .from(sessionAttendance)
      .where(and(inArray(sessionAttendance.sessionId, sessionIds), eq(sessionAttendance.role, "STUDENT"))),
    // Follow-ups are audit rows — append-only, newest wins. See api/admin/trials.
    db
      .select({
        target: auditLogs.target,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(
        and(
          orgFilter(admin, auditLogs.orgId),
          eq(auditLogs.action, "USER_UPDATED"),
          inArray(auditLogs.target, sessionIds.map((id) => `session:${id}`)),
          sql`${auditLogs.metadata}->>'op' = ${TRIAL_FOLLOW_UP_OP}`
        )
      )
      .orderBy(desc(auditLogs.createdAt)),
  ]);

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const profilesByUser = new Map<string, typeof profiles>();
  for (const p of profiles) {
    const l = profilesByUser.get(p.userId);
    if (l) l.push(p);
    else profilesByUser.set(p.userId, [p]);
  }
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const lastSignal = new Map<string, number>();
  for (const m of [
    latestBy(subs, (r) => r.userId, (r) => r.at),
    latestBy(laterBookings, (r) => r.userId, (r) => r.at),
    latestBy(paid, (r) => r.userId, (r) => r.at),
  ]) {
    for (const [k, t] of m) if (t > (lastSignal.get(k) ?? -Infinity)) lastSignal.set(k, t);
  }
  const attended = new Set(joined.map((j) => j.sessionId));
  const followUpBySession = new Map<string, TrialRow["followUp"]>();
  for (const f of followUps) {
    const id = f.target?.slice("session:".length);
    if (!id || followUpBySession.has(id)) continue;
    const meta = (f.metadata ?? {}) as { followUp?: string; note?: string | null };
    const value = (TRIAL_FOLLOW_UPS as readonly string[]).includes(meta.followUp ?? "")
      ? (meta.followUp as TrialFollowUp)
      : "NONE";
    followUpBySession.set(id, { value, at: f.createdAt.toISOString(), by: f.actorName, note: meta.note ?? null });
  }

  const rows = list.map((t): TrialRow => {
    const contact = contactById.get(t.userId);
    const own = profilesByUser.get(t.userId) ?? [];
    const profile = (t.profileId ? profileById.get(t.profileId) : undefined) ?? (own.length === 1 ? own[0] : undefined);
    const followUp = followUpBySession.get(t.sessionId) ?? null;
    // Only evidence dated after the trial counts — a family that was already
    // paying for one child and trialled another hasn't "converted" from it.
    const converted = (lastSignal.get(t.userId) ?? -Infinity) >= t.bookedAt.getTime();
    const over = t.endsAt <= now;

    let stage: TrialStage;
    if (converted) stage = "CONVERTED";
    else if (followUp?.value === "DECLINED") stage = "DECLINED";
    else if (t.status === "CANCELLED" || t.bookingStatus === "CANCELLED") stage = "CANCELLED";
    else if (t.status === "NO_SHOW" || t.bookingStatus === "NO_SHOW") stage = "NO_SHOW";
    else if (t.status === "COMPLETED" || t.bookingStatus === "COMPLETED") stage = "ATTENDED";
    // Same "upcoming" as the overview's count: SCHEDULED and not yet started.
    else if (t.status === "SCHEDULED" && t.startsAt > now) stage = "UPCOMING";
    else if (!over) stage = "IN_CLASS";
    else stage = attended.has(t.sessionId) ? "ATTENDED" : "NEEDS_OUTCOME";

    return {
      sessionId: t.sessionId,
      title: t.title,
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      bookedAt: t.bookedAt.toISOString(),
      sessionStatus: t.status,
      bookingStatus: t.bookingStatus,
      stage,
      teacherName: t.teacherName,
      track: t.track ?? profile?.track ?? null,
      familyUserId: t.userId,
      contactName: contact?.name ?? "Unknown",
      contactEmail: contact?.email ?? "",
      contactPhone: contact?.phone ?? null,
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? null,
      followUp,
    };
  });

  return { rows, truncated };
}
