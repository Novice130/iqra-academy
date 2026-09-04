/**
 * @fileoverview Direct Call API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 * POST /api/calls — Teacher "calls" a specific student. Two modes:
 *   - No `sessionId`: creates a fresh instant session and rings into it
 *     (used by the pre-meeting "Call" button on My Students).
 *   - `sessionId` provided: rings a student into an ALREADY-RUNNING session
 *     (used by the in-call "Add Student" button — a Teams-style "bring in
 *     the student who didn't show up" without ending the current call).
 * Either way the student's dashboard polls GET /api/calls/incoming and
 * shows a full-screen ring UI, and the mobile app is sent a ring push so a
 * phone with the site closed still rings.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { handleApiError, ForbiddenError } from "@/lib/errors";
import { ringParticipantIntoCanonicalRoom } from "@/lib/meeting-service";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json().catch(() => ({}));
      const studentProfileId: string | undefined = body?.studentProfileId;
      const existingSessionId: string | undefined = body?.sessionId;
      if (!studentProfileId) {
        throw new ForbiddenError("studentProfileId is required");
      }

      const result = await ringParticipantIntoCanonicalRoom({
        orgId: ctx.orgId,
        teacherId: ctx.userId,
        studentProfileId,
        existingSessionId,
        isSuperAdmin: ctx.role === "SUPER_ADMIN",
      });

      return NextResponse.json(result);
    } catch (error) {
      return handleApiError(error);
    }
  });
}
