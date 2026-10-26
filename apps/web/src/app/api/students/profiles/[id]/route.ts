/**
 * @fileoverview Student Profile Individual Management API
 *
 * RBAC: the family account (STUDENT) for its own child profiles, ORG_ADMIN
 * within its org, SUPER_ADMIN anywhere. Teachers are refused.
 *
 * PATCH  /api/students/profiles/[id] — Update student profile
 * DELETE /api/students/profiles/[id] — Delete student profile
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRLS, withDb } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { studentProfiles } from "@/db/schema";
import { requireRole, type AuthContext } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).optional(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  track: z.enum(["QAIDAH", "QURAN_READING", "HIFZ"]).optional(),
  currentLevel: z.string().max(100).optional(),
  notes: z.string().max(500).optional().nullable(),
});

/**
 * Which profiles the caller may change. requireRole is hierarchical, so the
 * STUDENT floor below also admits teachers; they get nothing here. A family
 * account changes its own children, an ORG_ADMIN its own org, a SUPER_ADMIN
 * any. A profile outside that reads as not found.
 */
function profileScope(ctx: AuthContext) {
  switch (ctx.role) {
    case "STUDENT":
      return eq(studentProfiles.userId, ctx.userId);
    case "ORG_ADMIN":
      return eq(studentProfiles.orgId, ctx.orgId);
    case "SUPER_ADMIN":
      return undefined;
    default:
      throw new ForbiddenError("Only the family account or an admin can change a student profile.");
  }
}

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
          where: and(eq(studentProfiles.id, id), profileScope(ctx)),
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
          orgId: existing.orgId,
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
          where: and(eq(studentProfiles.id, id), profileScope(ctx)),
        });

        if (!existing) {
          throw new NotFoundError("Student profile not found.");
        }

        await tx.delete(studentProfiles).where(eq(studentProfiles.id, id));

        await logAudit({
          orgId: existing.orgId,
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
