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
import { and, desc, eq, lt } from "drizzle-orm";
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
  // An ORG_ADMIN hosts for their own org only. Role alone is not enough here:
  // this endpoint decides who walks into a live lesson, so an admin of one
  // org must not be able to admit outsiders into another org's class.
  const isAdmin = user
    ? user.role === "SUPER_ADMIN" || (user.role === "ORG_ADMIN" && user.orgId === session.orgId)
    : false;
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

      // Retire stale knocks rather than merely hiding them. Filtering them out
      // of this list left the row PENDING forever, so the guest's own page —
      // which can only see the status — spun on "Asking to be let in…" long
      // after the host stopped being shown the knock.
      await db
        .update(guestJoinRequests)
        .set({ status: "EXPIRED" })
        .where(
          and(
            eq(guestJoinRequests.sessionId, sessionId),
            eq(guestJoinRequests.status, "PENDING"),
            lt(guestJoinRequests.createdAt, new Date(Date.now() - KNOCK_WINDOW_MS))
          )
        );

      const waiting = await db.query.guestJoinRequests.findMany({
        where: and(
          eq(guestJoinRequests.sessionId, sessionId),
          eq(guestJoinRequests.status, "PENDING")
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
      // Only a live knock can be answered. Re-admitting an already-answered
      // row would reset its clock, which is what bounds the guest's token.
      if (req.status !== "PENDING") {
        throw new BusinessRuleError("That request has already been answered.");
      }

      await db
        .update(guestJoinRequests)
        .set({ status: action === "admit" ? "ADMITTED" : "DENIED", respondedAt: new Date() })
        .where(and(eq(guestJoinRequests.id, requestId), eq(guestJoinRequests.status, "PENDING")));

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
