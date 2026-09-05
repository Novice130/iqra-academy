/**
 * @fileoverview Combining two consecutive classes into one, and undoing it.
 *
 * RBAC: TEACHER for their own classes, ORG_ADMIN for anybody's.
 * GET    /api/sessions/merge — pairs that could be combined
 * POST   /api/sessions/merge — combine two
 * DELETE /api/sessions/merge — separate them again
 *
 * The shape of the operation, and why nothing is deleted, is written up in
 * lib/class-merge.ts. This file is the guards and the paperwork.
 *
 * ── The one irreversible-looking part ───────────────────────────────────────
 * Merging moves bookings off the absorbed row, and the row itself keeps no
 * record of which ones came from where — there is no column for it and adding
 * one to carry a fact that is only interesting for as long as somebody might
 * press undo would be the wrong trade. The record lives in the audit log
 * instead, in the SESSION_MERGED entry's metadata, which is permanent and is
 * where "who did this to this family's schedule" was always going to have to
 * be answered from. DELETE reads it back. If it cannot find that entry it
 * refuses rather than guessing, because guessing means putting a child in the
 * wrong class.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withDb, withRLS } from "@/lib/db";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { auditLogs, bookings, sessions, studentProfiles, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import {
  handleApiError,
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";
import { notify } from "@/lib/notify";
import {
  CONSECUTIVE_GAP_MS,
  MAX_CLASS_SIZE,
  findMergeCandidates,
} from "@/lib/class-merge";

const ADMIN_ROLES = ["ORG_ADMIN", "SUPER_ADMIN"];

const mergeSchema = z.object({
  /** The class that survives — its time is the time everybody now attends. */
  keepId: z.string().min(1),
  /** The class being folded into it. Goes CANCELLED, keeps its history. */
  mergeId: z.string().min(1),
});

const unmergeSchema = z.object({
  /** The cancelled row. The survivor is read from its merged_into_id. */
  sessionId: z.string().min(1),
});

/** "Mon, Sep 1, 6:00 PM" in a given zone. */
function formatIn(instant: Date, zone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone || "UTC",
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(instant);
  } catch {
    return instant.toISOString();
  }
}

/** GET /api/sessions/merge — what could be combined. */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      // A teacher is only ever offered their own classes. An admin can ask
      // for one teacher's or for the whole school's.
      const isAdmin = ADMIN_ROLES.includes(ctx.role);
      const asked = new URL(request.url).searchParams.get("teacherId");
      const teacherId = isAdmin ? asked : ctx.userId;

      const candidates = await findMergeCandidates(ctx.orgId, teacherId);
      return NextResponse.json({ candidates });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/** POST /api/sessions/merge — fold one class into another. */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const isAdmin = ADMIN_ROLES.includes(ctx.role);

      const data = mergeSchema.parse(await request.json());
      if (data.keepId === data.mergeId) {
        throw new BusinessRuleError("Those are the same class.");
      }

      const result = await withRLS(ctx, async (tx) => {
        // Locked for the length of the transaction: two teachers merging the
        // same pair from two devices would otherwise both read SCHEDULED and
        // both move the bookings, and the second move would land on a row
        // that is already cancelled.
        const rows = await tx
          .select()
          .from(sessions)
          .where(
            and(
              inArray(sessions.id, [data.keepId, data.mergeId]),
              eq(sessions.orgId, ctx.orgId)
            )
          )
          .for("update");

        const keep = rows.find((r) => r.id === data.keepId);
        const merge = rows.find((r) => r.id === data.mergeId);
        if (!keep || !merge) throw new NotFoundError("Session");

        if (!isAdmin && (keep.teacherId !== ctx.userId || merge.teacherId !== ctx.userId)) {
          throw new ForbiddenError("Those aren't your classes.");
        }
        if (keep.teacherId !== merge.teacherId) {
          throw new BusinessRuleError(
            "Those classes have different teachers. Reassign one first."
          );
        }
        for (const s of [keep, merge]) {
          if (s.status !== "SCHEDULED") {
            throw new BusinessRuleError(
              "Only a class that hasn't started yet can be combined."
            );
          }
          if (s.mergedIntoId) {
            throw new BusinessRuleError("That class has already been combined into another.");
          }
          if (s.isTrial) {
            throw new BusinessRuleError(
              "A trial class is one-to-one with the teacher. It can't be combined."
            );
          }
        }
        if (keep.scheduledStart.getTime() <= Date.now()) {
          throw new BusinessRuleError(
            "That class is due to start. Combining it now would move a family with no warning."
          );
        }

        // Back-to-back, measured between whichever runs first and the other's
        // start. Same rule the suggestions are generated with, re-checked here
        // because the request body is not the suggestion list.
        const [first, second] =
          keep.scheduledStart <= merge.scheduledStart ? [keep, merge] : [merge, keep];
        const gap = second.scheduledStart.getTime() - first.scheduledEnd.getTime();
        if (gap > CONSECUTIVE_GAP_MS) {
          throw new BusinessRuleError(
            "Those classes aren't back to back. Move one of them first."
          );
        }

        const moving = await tx
          .select({ id: bookings.id, userId: bookings.userId })
          .from(bookings)
          .where(and(eq(bookings.sessionId, merge.id), ne(bookings.status, "CANCELLED")));

        if (moving.length === 0) {
          throw new BusinessRuleError("Nobody is booked on that class — cancel it instead.");
        }

        const staying = await tx
          .select({ id: bookings.id, userId: bookings.userId })
          .from(bookings)
          .where(and(eq(bookings.sessionId, keep.id), ne(bookings.status, "CANCELLED")));

        if (moving.length + staying.length > MAX_CLASS_SIZE) {
          throw new BusinessRuleError(
            `That would be ${moving.length + staying.length} students in one class. ${MAX_CLASS_SIZE} is the most that fits in half an hour.`
          );
        }

        await tx
          .update(bookings)
          .set({ sessionId: keep.id })
          .where(inArray(bookings.id, moving.map((b) => b.id)));

        // session_attendees is keyed unique on (session_id, student_profile_id).
        // Nothing has ever written to it (see the schema note), but moving its
        // rows blind would throw the day something does, so skip any profile
        // already present on the survivor.
        await tx.execute(sql`
          UPDATE session_attendees SET session_id = ${keep.id}
          WHERE session_id = ${merge.id}
            AND student_profile_id NOT IN (
              SELECT student_profile_id FROM session_attendees WHERE session_id = ${keep.id}
            )
        `);

        // A row that had already been merged into the one now being absorbed
        // must follow it, or its pointer leads to a cancelled dead end.
        await tx
          .update(sessions)
          .set({ mergedIntoId: keep.id })
          .where(eq(sessions.mergedIntoId, merge.id));

        // Who is in the class now, for the title and the type.
        const roster = await tx
          .select({
            userId: bookings.userId,
            profileName: studentProfiles.name,
            accountName: users.name,
            accountEmail: users.email,
          })
          .from(bookings)
          .innerJoin(users, eq(users.id, bookings.userId))
          .leftJoin(studentProfiles, eq(studentProfiles.id, bookings.studentProfileId))
          .where(and(eq(bookings.sessionId, keep.id), ne(bookings.status, "CANCELLED")));

        const names = roster.map((r) => r.profileName || r.accountName || r.accountEmail);
        const families = new Set(roster.map((r) => r.userId));
        // SIBLINGS when it is one family's children, GROUP when it is two
        // households. The distinction is what lib/quota.ts bills against.
        const type =
          roster.length <= 1 ? "INDIVIDUAL" : families.size === 1 ? "SIBLINGS" : "GROUP";

        const mergedTitle = names.length > 0 ? `Class — ${names.join(", ")}` : keep.title;

        const [survivor] = await tx
          .update(sessions)
          .set({ type, title: mergedTitle })
          .where(eq(sessions.id, keep.id))
          .returning();

        const [absorbed] = await tx
          .update(sessions)
          .set({ status: "CANCELLED", mergedIntoId: keep.id })
          .where(eq(sessions.id, merge.id))
          .returning();

        // The absorbed row is a cancellation for everyone booked on it: their
        // class no longer happens at this time. Emit one booking.cancelled per
        // moved booking plus session.changed for both rows, in the same
        // transaction as the move itself.
        for (const b of moving) {
          await insertSchedulingEvent(tx, {
            orgId: ctx.orgId,
            teacherId: keep.teacherId,
            actorId: ctx.userId,
            type: "booking.cancelled",
            aggregateType: "booking",
            aggregateId: b.id,
          });
        }
        await insertSchedulingEvent(tx, {
          orgId: ctx.orgId,
          teacherId: keep.teacherId,
          actorId: ctx.userId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: merge.id,
        });
        await insertSchedulingEvent(tx, {
          orgId: ctx.orgId,
          teacherId: keep.teacherId,
          actorId: ctx.userId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: keep.id,
        });

        const teacher = await tx.query.users.findFirst({
          where: eq(users.id, keep.teacherId),
          columns: { id: true, name: true, timezone: true },
        });

        const affected = await tx
          .select({ id: users.id, timezone: users.timezone })
          .from(users)
          .where(inArray(users.id, [...new Set([...moving, ...staying].map((b) => b.userId))]));

        return {
          survivor,
          absorbed,
          movedBookingIds: moving.map((b) => b.id),
          movedUserIds: [...new Set(moving.map((b) => b.userId))],
          affected,
          teacher,
          previousType: keep.type,
          // A title is written by a person; a type is derived from a roster.
          // Overwriting the survivor's title here is right while the classes
          // are combined, but the old string is not recoverable from anything
          // else, so it goes in the log beside previousType. `mergedTitle` is
          // what DELETE compares against to tell "nobody touched this since"
          // from "somebody renamed it deliberately".
          previousTitle: keep.title,
          mergedTitle,
          studentCount: roster.length,
        };
      });

      await logAudit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "SESSION_MERGED",
        // Targeted at the absorbed row: that is the id DELETE arrives with,
        // and the id anything following a merged_into_id pointer starts from.
        target: `session:${result.absorbed.id}`,
        metadata: {
          intoSessionId: result.survivor.id,
          movedBookingIds: result.movedBookingIds,
          previousType: result.previousType,
          previousTitle: result.previousTitle,
          mergedTitle: result.mergedTitle,
          studentCount: result.studentCount,
        },
        ipAddress: getClientIp(request.headers),
      });

      // The families whose class moved need to hear it from the app, not from
      // an empty room. Told after the transaction commits — same reason as
      // everywhere else: Resend and FCM are network calls and a Worker's
      // transaction should not be held open across one.
      const whenFor = (zone: string | null) =>
        formatIn(result.survivor.scheduledStart, zone);

      for (const family of result.affected) {
        const moved = result.movedUserIds.includes(family.id);
        await notify({
          orgId: ctx.orgId,
          userIds: [family.id],
          type: "CLASS_MOVED",
          title: moved ? "Your class has moved" : "Your class has a new classmate",
          body: moved
            ? `Your class is now at ${whenFor(family.timezone)}, together with another student.`
            : `Another student is joining your class at ${whenFor(family.timezone)}.`,
          path: "/dashboard",
          sessionId: result.survivor.id,
        });
      }

      // An admin combining somebody else's classes has to tell them.
      if (isAdmin && result.teacher && result.teacher.id !== ctx.userId) {
        await notify({
          orgId: ctx.orgId,
          userIds: [result.teacher!.id],
          type: "CLASS_MOVED",
          title: "Two of your classes were combined",
          body: `They now run as one class at ${whenFor(result.teacher!.timezone)}.`,
          path: "/dashboard/teacher",
          sessionId: result.survivor.id,
        });
      }

      afterResponse(drainOutbox({ orgId: ctx.orgId }).catch(() => {}));

      return NextResponse.json({
        session: result.survivor,
        merged: result.absorbed,
        studentCount: result.studentCount,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/**
 * DELETE /api/sessions/merge — separate two classes again.
 *
 * Restores the absorbed row to SCHEDULED and moves back exactly the bookings
 * the merge moved, read from the audit entry. Anything booked onto the
 * survivor *since* the merge stays where it is: it was booked into that class,
 * at that time, by somebody who saw it.
 */
export async function DELETE(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const isAdmin = ADMIN_ROLES.includes(ctx.role);

      const data = unmergeSchema.parse(await request.json());

      const result = await withRLS(ctx, async (tx) => {
        const [absorbed] = await tx
          .select()
          .from(sessions)
          .where(and(eq(sessions.id, data.sessionId), eq(sessions.orgId, ctx.orgId)))
          .for("update");

        if (!absorbed) throw new NotFoundError("Session");
        if (!absorbed.mergedIntoId) {
          throw new BusinessRuleError("That class wasn't combined into another one.");
        }
        if (!isAdmin && absorbed.teacherId !== ctx.userId) {
          throw new ForbiddenError("That isn't your class.");
        }
        if (absorbed.scheduledStart.getTime() <= Date.now()) {
          throw new BusinessRuleError("That class's slot has passed. Book a new one instead.");
        }

        const [survivor] = await tx
          .select()
          .from(sessions)
          .where(eq(sessions.id, absorbed.mergedIntoId))
          .for("update");
        if (!survivor) throw new NotFoundError("Session");
        if (survivor.status !== "SCHEDULED") {
          throw new BusinessRuleError(
            "The combined class has already run. Separating it now would rewrite what happened."
          );
        }

        // The only record of what moved.
        const [entry] = await tx
          .select({ metadata: auditLogs.metadata })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.orgId, ctx.orgId),
              eq(auditLogs.action, "SESSION_MERGED"),
              eq(auditLogs.target, `session:${absorbed.id}`)
            )
          )
          .orderBy(desc(auditLogs.createdAt))
          .limit(1);

        const merged = (entry?.metadata ?? null) as {
          movedBookingIds?: unknown;
          previousTitle?: unknown;
          mergedTitle?: unknown;
        } | null;

        const movedBookingIds = Array.isArray(merged?.movedBookingIds)
          ? (merged!.movedBookingIds as string[])
          : [];

        // What the survivor was called before the merge renamed it, and what
        // the merge renamed it to. Both absent on a merge performed before
        // these were recorded — that case falls back to deriving a title,
        // which is what this route always did.
        const hadTitle = merged !== null && "previousTitle" in merged;
        const previousTitle =
          typeof merged?.previousTitle === "string" ? merged.previousTitle : null;
        const mergedTitle =
          typeof merged?.mergedTitle === "string" ? merged.mergedTitle : null;

        if (movedBookingIds.length === 0) {
          throw new BusinessRuleError(
            "There's no record of which students moved, so separating these automatically would guess. Move the bookings by hand."
          );
        }

        await tx
          .update(bookings)
          .set({ sessionId: absorbed.id })
          .where(
            and(
              inArray(bookings.id, movedBookingIds),
              eq(bookings.sessionId, survivor.id),
              eq(bookings.orgId, ctx.orgId)
            )
          );

        const [restored] = await tx
          .update(sessions)
          .set({ status: "SCHEDULED", mergedIntoId: null })
          .where(eq(sessions.id, absorbed.id))
          .returning();

        // Un-merge is the reverse: the restored row happens again (bookings
        // move back onto it), so each moved booking gets booking.created and
        // both rows get session.changed, atomically with the move.
        for (const bookingId of movedBookingIds) {
          await insertSchedulingEvent(tx, {
            orgId: ctx.orgId,
            teacherId: survivor.teacherId,
            actorId: ctx.userId,
            type: "booking.created",
            aggregateType: "booking",
            aggregateId: bookingId,
          });
        }
        await insertSchedulingEvent(tx, {
          orgId: ctx.orgId,
          teacherId: survivor.teacherId,
          actorId: ctx.userId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: absorbed.id,
        });
        await insertSchedulingEvent(tx, {
          orgId: ctx.orgId,
          teacherId: survivor.teacherId,
          actorId: ctx.userId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: survivor.id,
        });

        // The survivor's type was derived from a roster that has just
        // changed, so derive it again — it is a billing fact, and deriving it
        // is what keeps it honest when students were added since.
        //
        // The title is the opposite: a person wrote it, and merging replaced
        // it with a generated one. Deriving it again leaves "Class — Aisha"
        // where "Qaidah, Tuesdays" used to be, and the original is then gone
        // for good. So it is restored from the merge's audit entry — but only
        // when the survivor still carries the exact string the merge wrote.
        //
        // If it does not, somebody renamed the class while it was combined.
        // That title is theirs, so it is left exactly as it is: restoring the
        // pre-merge one would undo their edit, and generating a fresh one
        // would throw it away just as surely.
        //
        // Only a merge performed before any of this was recorded falls back
        // to deriving a title, because for those there is nothing to restore.
        const roster = await tx
          .select({
            userId: bookings.userId,
            profileName: studentProfiles.name,
            accountName: users.name,
            accountEmail: users.email,
          })
          .from(bookings)
          .innerJoin(users, eq(users.id, bookings.userId))
          .leftJoin(studentProfiles, eq(studentProfiles.id, bookings.studentProfileId))
          .where(and(eq(bookings.sessionId, survivor.id), ne(bookings.status, "CANCELLED")));

        const names = roster.map((r) => r.profileName || r.accountName || r.accountEmail);
        const families = new Set(roster.map((r) => r.userId));
        const type =
          roster.length <= 1 ? "INDIVIDUAL" : families.size === 1 ? "SIBLINGS" : "GROUP";

        const untouched = mergedTitle !== null && survivor.title === mergedTitle;
        const title = hadTitle
          ? untouched
            ? previousTitle
            : survivor.title
          : names.length > 0
            ? `Class — ${names.join(", ")}`
            : survivor.title;

        const [survivorAfter] = await tx
          .update(sessions)
          .set({ type, title })
          .where(eq(sessions.id, survivor.id))
          .returning();

        const movedUsers = await tx
          .select({ id: users.id, timezone: users.timezone })
          .from(bookings)
          .innerJoin(users, eq(users.id, bookings.userId))
          .where(and(eq(bookings.sessionId, absorbed.id), ne(bookings.status, "CANCELLED")));

        return { restored, survivor: survivorAfter, movedUsers, movedBookingIds };
      });

      await logAudit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "SESSION_UNMERGED",
        target: `session:${result.restored.id}`,
        metadata: {
          fromSessionId: result.survivor.id,
          movedBookingIds: result.movedBookingIds,
        },
        ipAddress: getClientIp(request.headers),
      });

      for (const family of result.movedUsers) {
        await notify({
          orgId: ctx.orgId,
          userIds: [family.id],
          type: "CLASS_MOVED",
          title: "Your class has moved back",
          body: `Your class is at ${formatIn(result.restored.scheduledStart, family.timezone)} again.`,
          path: "/dashboard",
          sessionId: result.restored.id,
        });
      }

      afterResponse(drainOutbox({ orgId: ctx.orgId }).catch(() => {}));

      return NextResponse.json({ session: result.restored, from: result.survivor });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
