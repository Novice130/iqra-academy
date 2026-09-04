/**
 * @fileoverview Single Session Management API
 *
 * RBAC: TEACHER (owner), ORG_ADMIN, SUPER_ADMIN
 * DELETE /api/sessions/[id] — Permanently deletes a session and its
 * dependent rows (bookings, attendees, chat rooms, feedback, progress).
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { deleteSessionCascade } from "@/lib/session-cleanup";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
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

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
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
      const body = await request.json().catch(() => ({}));

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });
      if (!session) throw new NotFoundError("Session");

      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
      });
      const isAdmin = user
        ? user.role === "SUPER_ADMIN" ||
          (user.role === "ORG_ADMIN" && user.orgId === session.orgId)
        : false;
      const isOwner = session.teacherId === ctx.userId || isAdmin;

      if (!isOwner) {
        throw new ForbiddenError("Only the teacher or an admin can update this session.");
      }

      const allowedStatuses = ["SCHEDULED", "CANCELLED", "COMPLETED"];
      if (body.status && !allowedStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      await db.transaction(async (tx) => {
        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (body.status) updateData.status = body.status;
        if (body.title) updateData.title = body.title;
        if (body.teacherId && isAdmin) updateData.teacherId = body.teacherId;

        await tx.update(sessions).set(updateData).where(eq(sessions.id, sessionId));

        if (body.status === "CANCELLED") {
          const { bookings } = await import("@/db/schema");
          await tx
            .update(bookings)
            .set({ status: "CANCELLED", updatedAt: new Date() })
            .where(eq(bookings.sessionId, sessionId));
        }

        const { insertSchedulingEvent } = await import("@/lib/realtime/outbox");
        await insertSchedulingEvent(tx as never, {
          orgId: session.orgId,
          teacherId: session.teacherId,
          actorId: ctx.userId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: sessionId,
        });
      });

      const { drainOutbox } = await import("@/lib/realtime/outbox-publisher");
      const { afterResponse } = await import("@/lib/after-response");
      afterResponse(drainOutbox({ orgId: session.orgId, limit: 10 }));

      return NextResponse.json({
        success: true,
        session: {
          id: sessionId,
          status: body.status || session.status,
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
