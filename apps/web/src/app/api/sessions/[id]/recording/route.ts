/**
 * @fileoverview Session Recording Control API
 *
 * RBAC: session host (assigned teacher, same-org ORG_ADMIN, SUPER_ADMIN)
 * POST /api/sessions/[id]/recording — Toggle recording access for students
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, withDb } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { sessions } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { loadOrgSession, assertSessionHost } from "@/lib/session-access";
import { handleApiError } from "@/lib/errors";

const recordingSchema = z.object({
  recordingUrl: z.string().url().optional(),
  /** Who can access the recording: NONE, STUDENT_ONLY, STUDENT_AND_OBSERVERS, ALL */
  access: z.enum(["NONE", "STUDENT_ONLY", "STUDENT_AND_OBSERVERS", "ALL"]),
});

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

      const body = await request.json();
      const data = recordingSchema.parse(body);

      // Single host definition shared with every other session-object route.
      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      assertSessionHost(session, ctx);

      const [updated] = await db
        .update(sessions)
        .set({
          ...(data.recordingUrl && { recordingUrl: data.recordingUrl }),
          recordingAccess: data.access,
        })
        .where(and(eq(sessions.id, sessionId), eq(sessions.orgId, session.orgId)))
        .returning();

      return NextResponse.json({ session: updated });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
