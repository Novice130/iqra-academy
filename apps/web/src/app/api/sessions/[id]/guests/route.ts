/**
 * @fileoverview Guest Admission API — the host side of knock-to-join.
 *
 * RBAC: host only (the session's teacher, or an org/super admin)
 * GET  /api/sessions/[id]/guests — who is waiting at the door
 * POST /api/sessions/[id]/guests — { requestId, action: "admit" | "deny" }
 *
 * Admitting is what actually grants access; the guest's own endpoint only
 * mints a token once the row says ADMITTED. See /api/guest/join.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { and, desc, eq, gt } from "drizzle-orm";
import { guestJoinRequests, sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";

/** Knocks older than this are stale — nobody is still sitting there waiting. */
const KNOCK_WINDOW_MS = 10 * 60 * 1000;

async function assertHost(request: NextRequest, sessionId: string) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return { response: authResult };
  const ctx = authResult;

  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) throw new NotFoundError("Session");

  const user = await db.query.users.findFirst({ where: eq(users.id, ctx.userId) });
  const isAdmin = user ? ["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role) : false;
  if (session.teacherId !== ctx.userId && !isAdmin) {
    throw new ForbiddenError("Only the host can admit guests.");
  }
  return { session };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const { id: sessionId } = await params;
      const guard = await assertHost(request, sessionId);
      if ("response" in guard) return guard.response;

      const waiting = await db.query.guestJoinRequests.findMany({
        where: and(
          eq(guestJoinRequests.sessionId, sessionId),
          eq(guestJoinRequests.status, "PENDING"),
          gt(guestJoinRequests.createdAt, new Date(Date.now() - KNOCK_WINDOW_MS))
        ),
        orderBy: [desc(guestJoinRequests.createdAt)],
      });

      return NextResponse.json({
        guests: waiting.map((g) => ({ id: g.id, name: g.name, askedAt: g.createdAt.toISOString() })),
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const { id: sessionId } = await params;
      const guard = await assertHost(request, sessionId);
      if ("response" in guard) return guard.response;

      const body = await request.json().catch(() => ({}));
      const { requestId, action } = body || {};
      if (typeof requestId !== "string" || (action !== "admit" && action !== "deny")) {
        throw new BusinessRuleError('requestId and action ("admit" | "deny") are required');
      }

      const req = await db.query.guestJoinRequests.findFirst({
        where: and(eq(guestJoinRequests.id, requestId), eq(guestJoinRequests.sessionId, sessionId)),
      });
      if (!req) throw new NotFoundError("Request");

      await db
        .update(guestJoinRequests)
        .set({ status: action === "admit" ? "ADMITTED" : "DENIED", respondedAt: new Date() })
        .where(eq(guestJoinRequests.id, requestId));

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
