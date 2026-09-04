/**
 * @fileoverview Trial classes — the first class, before anybody has paid.
 *
 * RBAC: any signed-in user (STUDENT and above, so an admin can book one on a
 * family's behalf).
 * GET  /api/trials — the caller's trials; teachers see theirs, admins see all
 * POST /api/trials — book one
 *
 * ── Why this is not POST /api/students/bookings ─────────────────────────────
 * That route means "spend a class from my plan": it requires an ACTIVE
 * subscription before it reaches consumeQuota, and consumeQuota needs a
 * subscription id. A person booking a trial has neither, by definition. The
 * fix is a separate route, not a weakened one — quota accounting and "let a
 * stranger try a class" should not share a code path.
 *
 * ── Why a trial is an ordinary session row ──────────────────────────────────
 * A parallel trials table would mean reimplementing the LiveKit room
 * resolver, the join API, attendance, the teacher's Today schedule, chat
 * rooms and ringing — every one of which is keyed on sessions.id. A trial is
 * a class. It goes in `sessions`, with `isTrial` to mark it and
 * `consumesQuota: false` so no ledger is touched.
 *
 * `consumesQuota: false` alone would not do as the marker: instant meetings
 * and free makeups already set it, and we need to tell a trial apart from
 * those for the one-per-family rule and for reporting.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, withDb, withRLS } from "@/lib/db";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { bookings, sessions, studentProfiles, users } from "@/db/schema";
import { requireAuth, requireRole, ROLE_HIERARCHY } from "@/lib/rbac";
import { handleApiError, BusinessRuleError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { findOfferedSlot } from "@/lib/slots";
import { notify, getAdminRecipients } from "@/lib/notify";
import { sendTrialRequestEmail } from "@/lib/email";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";

const createSchema = z.object({
  teacherId: z.string().min(1),
  /** An absolute instant. Validated against real availability below. */
  startsAt: z.string().datetime(),
  studentProfileId: z.string().min(1).optional(),
  notes: z.string().max(500).optional(),
});

/** "Mon, Sep 1, 6:00 PM" in a given zone. */
function formatIn(instant: Date, zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(instant);
  } catch {
    return instant.toISOString();
  }
}

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["STUDENT"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = createSchema.parse(await request.json());
      const startsAt = new Date(data.startsAt);

      // Re-derive the slot on the server. Without this, any signed-in user can
      // book any teacher at 3 AM by POSTing a raw ISO string — the client's
      // list of offered times is a convenience, never an authority.
      const slot = await findOfferedSlot(ctx.orgId, data.teacherId, startsAt);
      if (!slot) {
        throw new BusinessRuleError(
          "That time isn't available any more. Pick another slot."
        );
      }

      const result = await withRLS(ctx, async (tx) => {
        // One free trial per account. Checked inside the transaction so two
        // taps on a slow connection cannot both get through.
        const existing = await tx
          .select({ id: bookings.id })
          .from(bookings)
          .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
          .where(
            and(
              eq(bookings.userId, ctx.userId),
              eq(sessions.isTrial, true),
              ne(bookings.status, "CANCELLED")
            )
          )
          .limit(1);

        if (existing.length > 0) {
          throw new BusinessRuleError(
            "You've already had your trial class. Get in touch and we'll set up your classes."
          );
        }

        // If a profile was named it has to be one of this account's children.
        if (data.studentProfileId) {
          const profile = await tx.query.studentProfiles.findFirst({
            where: and(
              eq(studentProfiles.id, data.studentProfileId),
              eq(studentProfiles.userId, ctx.userId)
            ),
            columns: { id: true },
          });
          if (!profile) throw new NotFoundError("Student profile");
        }

        const student = await tx.query.users.findFirst({
          where: eq(users.id, ctx.userId),
          columns: { name: true, email: true, timezone: true },
        });

        const [session] = await tx
          .insert(sessions)
          .values({
            orgId: ctx.orgId,
            teacherId: data.teacherId,
            type: "INDIVIDUAL",
            origin: "TRIAL",
            status: "SCHEDULED",
            title: `Trial class — ${student?.name || student?.email || "New student"}`,
            scheduledStart: slot.startsAt,
            scheduledEnd: slot.endsAt,
            isTrial: true,
            consumesQuota: false,
          })
          .returning();

        // Straight into bookings, not through consumeQuota: its
        // !consumesQuota branch does the right thing but still demands a valid
        // subscription id, which a trial booker does not have.
        const [booking] = await tx
          .insert(bookings)
          .values({
            orgId: ctx.orgId,
            userId: ctx.userId,
            studentProfileId: data.studentProfileId ?? null,
            sessionId: session.id,
            status: "CONFIRMED",
          })
          .returning();

        await insertSchedulingEvent(tx, {
          orgId: ctx.orgId,
          teacherId: data.teacherId,
          actorId: ctx.userId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: session.id,
        });

        await insertSchedulingEvent(tx, {
          orgId: ctx.orgId,
          teacherId: data.teacherId,
          actorId: ctx.userId,
          type: "booking.created",
          aggregateType: "booking",
          aggregateId: booking.id,
        });

        const teacher = await tx.query.users.findFirst({
          where: eq(users.id, data.teacherId),
          columns: { id: true, name: true, email: true },
        });

        return { session, booking, student, teacher };
      });

      afterResponse(drainOutbox({ orgId: ctx.orgId }).catch(() => {}));

      await logAudit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "BOOKING_CREATED",
        target: `session:${result.session.id}`,
        metadata: { trial: true, teacherId: data.teacherId, startsAt: data.startsAt },
        ipAddress: getClientIp(request.headers),
      });

      // Everything below is AFTER the transaction has committed. notify() and
      // Resend are HTTP round trips; awaiting them inside withRLS would hold a
      // Postgres interactive transaction open across a network call, on a
      // Worker.
      const admins = await getAdminRecipients(ctx.orgId);
      const studentZone = result.student?.timezone || slot.teacherTimeZone;
      const whenTeacher = formatIn(slot.startsAt, slot.teacherTimeZone);
      const whenStudent = formatIn(slot.startsAt, studentZone);
      const studentName = result.student?.name || result.student?.email || "A new student";
      const path = `/dashboard/session/${result.session.id}`;

      // The teacher and the admins, on every channel.
      await notify({
        orgId: ctx.orgId,
        userIds: [...new Set([data.teacherId, ...admins.userIds])],
        type: "TRIAL_REQUESTED",
        title: `New trial class — ${studentName}`,
        body: `${studentName} booked a trial class for ${whenTeacher}.`,
        path,
        sessionId: result.session.id,
        // The email is sent separately below with the richer template, so this
        // call only handles the in-app row and the push.
        channels: ["inapp", "push"],
      });

      await sendTrialRequestEmail(
        [
          ...new Set(
            [result.teacher?.email, ...admins.emails].filter(
              (e): e is string => typeof e === "string" && e.length > 0
            )
          ),
        ],
        {
          studentName,
          studentEmail: result.student?.email || "",
          teacherName: result.teacher?.name || "your teacher",
          whenTeacherZone: whenTeacher,
          whenStudentZone: whenStudent,
          manageUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}${path}`,
        }
      );

      // And the family, so they have it in writing too.
      await notify({
        orgId: ctx.orgId,
        userIds: [ctx.userId],
        type: "TRIAL_CONFIRMED",
        title: "Your trial class is booked",
        body: `${whenStudent} with ${result.teacher?.name || "your teacher"}.`,
        path,
        sessionId: result.session.id,
      });

      return NextResponse.json(
        {
          session: {
            id: result.session.id,
            startsAt: slot.startsAt.toISOString(),
            endsAt: slot.endsAt.toISOString(),
            teacherName: result.teacher?.name ?? null,
            teacherTimeZone: slot.teacherTimeZone,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/** GET /api/trials — whose trials you see depends on who you are. */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const rows = await db
        .select({
          sessionId: sessions.id,
          title: sessions.title,
          status: sessions.status,
          scheduledStart: sessions.scheduledStart,
          scheduledEnd: sessions.scheduledEnd,
          teacherId: sessions.teacherId,
          bookingUserId: bookings.userId,
          bookingStatus: bookings.status,
        })
        .from(sessions)
        .innerJoin(bookings, eq(bookings.sessionId, sessions.id))
        .where(and(eq(sessions.orgId, ctx.orgId), eq(sessions.isTrial, true)))
        .orderBy(desc(sessions.scheduledStart))
        .limit(200);

      const isAdmin = ROLE_HIERARCHY[ctx.role] >= ROLE_HIERARCHY.ORG_ADMIN;
      const visible = rows.filter(
        (r) =>
          isAdmin || r.teacherId === ctx.userId || r.bookingUserId === ctx.userId
      );

      return NextResponse.json({
        trials: visible.map((r) => ({
          sessionId: r.sessionId,
          title: r.title,
          status: r.status,
          startsAt: r.scheduledStart.toISOString(),
          endsAt: r.scheduledEnd.toISOString(),
          teacherId: r.teacherId,
          bookingStatus: r.bookingStatus,
        })),
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
