/**
 * @fileoverview Student Profile Individual Management API
 *
 * RBAC: STUDENT role (account owner manages their child profiles), or ADMIN
 *
 * PATCH  /api/students/profiles/[id] — Update student profile
 * DELETE /api/students/profiles/[id] — Delete student profile
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRLS, withDb } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { studentProfiles } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).optional(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  track: z.enum(["QAIDAH", "QURAN_READING", "HIFZ"]).optional(),
  currentLevel: z.string().max(100).optional(),
  notes: z.string().max(500).optional().nullable(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withDb(async () => {
    try {
      const { id } = await params;
      const authResult = await requireRole(request, ["STUDENT", "ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const data = updateProfileSchema.parse(body);

      return await withRLS(ctx, async (tx) => {
        const existing = await tx.query.studentProfiles.findFirst({
          where: and(
            eq(studentProfiles.id, id),
            ctx.role === "STUDENT" ? eq(studentProfiles.userId, ctx.userId) : undefined
          ),
        });

        if (!existing) {
          throw new NotFoundError("Student profile not found.");
        }

        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (data.name !== undefined) updateData.name = data.name;
        if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
        if (data.track !== undefined) updateData.track = data.track;
        if (data.currentLevel !== undefined) updateData.currentLevel = data.currentLevel;
        if (data.notes !== undefined) updateData.notes = data.notes;

        const [updated] = await tx
          .update(studentProfiles)
          .set(updateData)
          .where(eq(studentProfiles.id, id))
          .returning();

        await logAudit({
          orgId: ctx.orgId,
          actorId: ctx.userId,
          action: "USER_UPDATED",
          target: `profile:${id}`,
          metadata: { changes: data },
          ipAddress: getClientIp(request.headers),
        });

        return NextResponse.json({ profile: updated });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withDb(async () => {
    try {
      const { id } = await params;
      const authResult = await requireRole(request, ["STUDENT", "ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      return await withRLS(ctx, async (tx) => {
        const existing = await tx.query.studentProfiles.findFirst({
          where: and(
            eq(studentProfiles.id, id),
            ctx.role === "STUDENT" ? eq(studentProfiles.userId, ctx.userId) : undefined
          ),
        });

        if (!existing) {
          throw new NotFoundError("Student profile not found.");
        }

        await tx.delete(studentProfiles).where(eq(studentProfiles.id, id));

        await logAudit({
          orgId: ctx.orgId,
          actorId: ctx.userId,
          action: "USER_DELETED",
          target: `profile:${id}`,
          ipAddress: getClientIp(request.headers),
        });

        return NextResponse.json({ success: true });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
