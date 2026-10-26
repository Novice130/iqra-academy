/**
 * @fileoverview Single Session Management API
 *
 * RBAC: TEACHER (owner), ORG_ADMIN, SUPER_ADMIN
 * DELETE /api/sessions/[id] — Permanently deletes a session and its
 * dependent rows (bookings, attendees, chat rooms, feedback, progress).
 * PATCH  /api/sessions/[id] — Cancel, reschedule, reassign, rename, or mark
 * the outcome (COMPLETED / NO_SHOW). The rules, audit and notifications live
 * in lib/admin-scheduling.ts; this handler only parses the body.
 *
 * PATCH body (all optional, combine as needed):
 *   status          SCHEDULED | IN_PROGRESS | CANCELLED | COMPLETED | NO_SHOW
 *   reason          why it was cancelled — sent to the family and teacher
 *                   (`notes` is accepted as an older alias)
 *   scheduledStart  ISO instant; scheduledEnd ISO instant
 *   localStart      "YYYY-MM-DDTHH:mm" read in `timeZone` (a form's
 *                   datetime-local); use instead of scheduledStart
 *   durationMinutes length of the class from the (new) start
 *   teacherId       give the class to another teacher of its org (admin only)
 *   title           rename
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { deleteSessionCascade } from "@/lib/session-cleanup";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, AppError } from "@/lib/errors";
import { getClientIp, logAudit } from "@/lib/audit";
import { updateSession, wallClockToInstant } from "@/lib/admin-scheduling";
import { z } from "zod";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });
      if (!session) throw new NotFoundError("Session");

      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
      });
      // An admin can delete only their own org's sessions. SUPER_ADMIN is the
      // only role allowed across orgs.
      const isAdmin = user
        ? user.role === "SUPER_ADMIN" ||
          (user.role === "ORG_ADMIN" && user.orgId === session.orgId)
        : false;
      const isOwner = session.teacherId === ctx.userId || isAdmin;

      if (!isOwner) {
        throw new ForbiddenError("Only the host or an admin can delete this session.");
      }

      // Deleting a session doesn't imply the LiveKit room is gone — force-close
      // it too, otherwise a still-open call keeps running (and billing) with no
      // DB row left to end it later. Not fatal if the room's already gone.
      const roomName = session.videoRoomName || generateRoomName(sessionId);
      await getRoomServiceClient().deleteRoom(roomName).catch(() => {});

      await db.transaction(async (tx) => {
        await deleteSessionCascade(tx as never, sessionId);
      });

      // The row is gone, so the log is the only record it ever existed.
      await logAudit({
        orgId: session.orgId,
        actorId: ctx.userId,
        action: "BOOKING_CANCELLED",
        target: `session:${sessionId}`,
        metadata: {
          op: "session.delete",
          title: session.title,
          status: session.status,
          teacherId: session.teacherId,
          scheduledStart: new Date(session.scheduledStart).toISOString(),
        },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

const patchSchema = z.object({
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  localStart: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "localStart must be YYYY-MM-DDTHH:mm").optional(),
  timeZone: z.string().min(1).max(64).optional(),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  teacherId: z.string().min(1).optional(),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
});

function parseInstant(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid date format for ${field}.`, 400, "BAD_REQUEST");
  return d;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;
      const body = patchSchema.parse(await request.json().catch(() => ({})));

      let scheduledStart = parseInstant(body.scheduledStart, "scheduledStart");
      let scheduledEnd = parseInstant(body.scheduledEnd, "scheduledEnd");
      if (body.localStart) {
        if (!body.timeZone) throw new AppError("timeZone is required with localStart.", 400, "BAD_REQUEST");
        const [date, time] = body.localStart.split("T");
        scheduledStart = wallClockToInstant(date, time, body.timeZone);
      }
      if (body.durationMinutes) {
        // Length from the new start, or from the current one when only the
        // length is changing.
        let base = scheduledStart;
        if (!base) {
          const current = await db.query.sessions.findFirst({
            where: eq(sessions.id, sessionId),
            columns: { scheduledStart: true },
          });
          if (!current) throw new NotFoundError("Session");
          base = new Date(current.scheduledStart);
        }
        scheduledStart = base;
        scheduledEnd = new Date(base.getTime() + body.durationMinutes * 60_000);
      }

      const result = await updateSession(
        { userId: ctx.userId, orgId: ctx.orgId, role: ctx.role, ipAddress: getClientIp(request.headers) },
        sessionId,
        {
          status: body.status,
          title: body.title,
          scheduledStart,
          scheduledEnd,
          teacherId: body.teacherId,
          reason: body.reason ?? body.notes,
        }
      );

      return NextResponse.json({
        success: true,
        session: {
          id: result.id,
          status: result.status,
          scheduledStart: result.scheduledStart.toISOString(),
          scheduledEnd: result.scheduledEnd.toISOString(),
          teacherId: result.teacherId,
        },
        ops: result.ops,
        // Every row of the class the change reached (a group class is several).
        sessionIds: result.sessionIds,
        notified: result.notified,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
