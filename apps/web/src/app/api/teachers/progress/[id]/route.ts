/**
 * @fileoverview Delete one progress entry.
 *
 * RBAC: TEACHER (and above). A teacher may delete only an entry they recorded,
 * within PROGRESS_DELETE_WINDOW_MS; an admin may delete any entry in their org.
 *
 * DELETE /api/teachers/progress/:id
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, withDb } from "@/lib/db";
import { progressRecords } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { assertProfileInOrg } from "@/lib/session-access";
import { canDeleteEntry } from "@/lib/progress";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const ctx = await requireRole(request, ["TEACHER"]);
      if (ctx instanceof NextResponse) return ctx;
      const { id } = await params;

      const record = await db.query.progressRecords.findFirst({ where: eq(progressRecords.id, id) });
      if (!record) throw new NotFoundError("Progress entry");

      // Org check through the profile; a foreign id reads as missing.
      let profile;
      try {
        profile = await assertProfileInOrg(record.studentProfileId, ctx.orgId, ctx.role === "SUPER_ADMIN");
      } catch {
        throw new NotFoundError("Progress entry");
      }

      if (!canDeleteEntry(ctx, { recordedById: record.teacherApprovedBy, updatedAt: record.updatedAt })) {
        throw new ForbiddenError("You can only delete your own entries within 24 hours of recording them.");
      }

      await db.delete(progressRecords).where(eq(progressRecords.id, id));

      await logAudit({
        orgId: profile.orgId,
        actorId: ctx.userId,
        action: "USER_UPDATED",
        target: `progress:${id}`,
        metadata: {
          op: "progress.delete",
          studentProfileId: record.studentProfileId,
          lessonId: record.lessonId,
          recordedBy: record.teacherApprovedBy,
        },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
