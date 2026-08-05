/**
 * @fileoverview Session End API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN (must own the session or be an admin)
 * POST /api/sessions/[id]/end — Marks a session COMPLETED when the host leaves,
 * so instant meetings stop showing as perpetually "in progress".
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";

export async function POST(
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
      const isAdmin = user ? ["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role) : false;
      const isHost = session.teacherId === ctx.userId || isAdmin;

      if (!isHost) {
        throw new ForbiddenError("Only the host can end this session.");
      }

      if (session.status === "IN_PROGRESS") {
        await db
          .update(sessions)
          .set({ status: "COMPLETED", actualEnd: new Date() })
          .where(eq(sessions.id, sessionId));
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
