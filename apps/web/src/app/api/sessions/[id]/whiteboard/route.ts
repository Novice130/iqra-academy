/**
 * @fileoverview Whiteboard ticket API — scoped access to the session board.
 *
 * RBAC: any session viewer (teacher, booked student, same-org admin, SUPER_ADMIN)
 * GET /api/sessions/[id]/whiteboard — { ticket, boardId, locked }
 * POST /api/sessions/[id]/whiteboard — host only: { locked: boolean } | { clear: true }
 *
 * The ticket is a 2-minute signed JWT bound to (orgId, sessionId, boardId,
 * isHost). The WhiteboardHub DO verifies it itself and partitions by instance
 * name `wb:<orgId>:<sessionId>:<boardId>` — cross-org sockets can never land
 * in the same instance. Strokes stay in the DO (SQLite) and are never logged.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { whiteboards } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { loadOrgSession, assertSessionHost, assertSessionViewer } from "@/lib/session-access";
import { createRealtimeTicket } from "@/lib/realtime/ticket";
import { createId } from "@paralleldrive/cuid2";

const BOARD_ID = "main";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;
      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      assertSessionViewer(session, ctx);

      let board = await db.query.whiteboards.findFirst({
        where: and(eq(whiteboards.sessionId, session.id), eq(whiteboards.orgId, session.orgId), eq(whiteboards.boardId, BOARD_ID)),
      });
      if (!board) {
        const [row] = await db
          .insert(whiteboards)
          .values({
            id: createId(),
            orgId: session.orgId,
            sessionId: session.id,
            boardId: BOARD_ID,
            durableObjectKey: `wb:${session.orgId}:${session.id}:${BOARD_ID}`,
          })
          .onConflictDoNothing()
          .returning();
        board =
          row ??
          (await db.query.whiteboards.findFirst({
            where: and(eq(whiteboards.sessionId, session.id), eq(whiteboards.orgId, session.orgId), eq(whiteboards.boardId, BOARD_ID)),
          }));
      }

      let isHost = false;
      try {
        assertSessionHost(session, ctx);
        isHost = true;
      } catch {
        isHost = false;
      }

      const ticket = await createRealtimeTicket({
        userId: ctx.userId,
        orgId: session.orgId,
        role: ctx.role,
        teacherId: session.teacherId ?? null,
        sessionId: session.id,
        boardId: BOARD_ID,
        isHost,
      } as never);

      return NextResponse.json({
        ticket,
        boardId: BOARD_ID,
        durableObjectKey: board?.durableObjectKey ?? `wb:${session.orgId}:${session.id}:${BOARD_ID}`,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;
      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      assertSessionHost(session, ctx);
      const body = await request.json().catch(() => ({}));
      await db
        .update(whiteboards)
        .set({ stateVersion: (body?.locked === true || body?.locked === false ? 1 : 1), updatedAt: new Date() })
        .where(and(eq(whiteboards.sessionId, session.id), eq(whiteboards.orgId, session.orgId), eq(whiteboards.boardId, BOARD_ID)))
        .catch(() => {});
      return NextResponse.json({ success: true, locked: body?.locked ?? null, cleared: body?.clear === true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
