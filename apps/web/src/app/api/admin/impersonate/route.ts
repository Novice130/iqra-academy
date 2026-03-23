/**
 * @fileoverview Admin Impersonation API
 *
 * RBAC: ORG_ADMIN role
 * POST /api/admin/impersonate — Start impersonating a user
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, and, isNull } from "drizzle-orm";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";

const impersonateSchema = z.object({
  targetUserId: z.string().min(1),
});

/** POST /api/admin/impersonate — start impersonation session */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const { targetUserId } = impersonateSchema.parse(body);

    // Can only impersonate users in the same org
    const target = await db.query.users.findFirst({
      where: and(eq(users.id, targetUserId), eq(users.orgId, ctx.orgId), isNull(users.deletedAt)),
    });
    if (!target) throw new NotFoundError("User");

    // Can't impersonate other admins or super admins
    if (target.role === "ORG_ADMIN" || target.role === "SUPER_ADMIN") {
      throw new ForbiddenError("Cannot impersonate admin-level users.");
    }

    await logAudit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "IMPERSONATION_START",
      target: `user:${targetUserId}`,
      metadata: { targetEmail: target.email, targetRole: target.role },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({
      impersonating: {
        userId: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
      },
      originalAdminId: ctx.userId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
