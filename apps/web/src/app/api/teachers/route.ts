/**
 * @fileoverview The org's teachers, for the booking screen's first step.
 *
 * RBAC: any authenticated user.
 * GET /api/teachers
 *
 * `timezone` is included on purpose. It is the field whose silence caused
 * every stored availability row to claim a zone nobody was in, so an admin
 * looking at this list should be able to see which teachers have not set one.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withHttpDb } from "@/lib/db";
import { and, eq, isNull } from "drizzle-orm";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const teachers = await db
        .select({
          id: users.id,
          name: users.name,
          image: users.image,
          timezone: users.timezone,
        })
        .from(users)
        .where(
          and(
            eq(users.orgId, ctx.orgId),
            eq(users.role, "TEACHER"),
            isNull(users.deletedAt)
          )
        );

      return NextResponse.json({ teachers });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
