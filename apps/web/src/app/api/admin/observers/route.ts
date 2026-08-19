/**
 * @fileoverview Admin Observer Email Configuration API
 *
 * RBAC: ORG_ADMIN or STUDENT (students manage their own observers)
 * GET  /api/admin/observers — List observer emails
 * POST /api/admin/observers — Add an observer email
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, withDb } from "@/lib/db";
import { eq, desc, inArray } from "drizzle-orm";
import { observerEmails, studentProfiles } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, ForbiddenError } from "@/lib/errors";

const observerSchema = z.object({
  email: z.string().email("Must be a valid email"),
  profileIds: z.array(z.string()).default([]),
  frequency: z.enum(["weekly", "daily"]).default("weekly"),
});

/**
 * Only a student (managing their own children's observers) or an admin may
 * touch observer config. TEACHER is deliberately excluded.
 */
async function requireObserverRole(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const ctx = authResult;

  if (!["STUDENT", "ORG_ADMIN", "SUPER_ADMIN"].includes(ctx.role)) {
    return NextResponse.json(
      { error: "Forbidden", message: "Only students and admins can manage observer emails." },
      { status: 403 }
    );
  }
  return ctx;
}

/**
 * Every profileId must belong to the caller's org, and a student is further
 * restricted to their own profiles. Observer config referencing another
 * tenant's child is how update emails leak across orgs.
 */
async function assertProfilesOwned(
  ctx: { userId: string; orgId: string; role: string },
  profileIds: string[]
) {
  if (profileIds.length === 0) return;

  const profiles = await db.query.studentProfiles.findMany({
    where: inArray(studentProfiles.id, profileIds),
    columns: { id: true, userId: true, orgId: true },
  });

  if (profiles.length !== profileIds.length) {
    throw new ForbiddenError("One or more profile ids are not valid.");
  }

  for (const profile of profiles) {
    if (profile.orgId !== ctx.orgId) {
      throw new ForbiddenError("You can only attach observers to profiles in your own organization.");
    }
    if (ctx.role === "STUDENT" && profile.userId !== ctx.userId) {
      throw new ForbiddenError("You can only attach observers to your own profiles.");
    }
  }
}

/** GET /api/admin/observers — list observer emails for the current user */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireObserverRole(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const observers = await db.query.observerEmails.findMany({
        where: eq(observerEmails.userId, ctx.userId),
        orderBy: desc(observerEmails.createdAt),
      });

      return NextResponse.json({ observers });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/** POST /api/admin/observers — add an observer email */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireObserverRole(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const data = observerSchema.parse(body);

      await assertProfilesOwned(ctx, data.profileIds);

      const [observer] = await db.insert(observerEmails).values({
        userId: ctx.userId,
        email: data.email,
        profileIds: data.profileIds,
        frequency: data.frequency,
      }).returning();

      return NextResponse.json({ observer }, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
