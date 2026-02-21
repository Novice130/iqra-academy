/**
 * @fileoverview Student Profiles API
 *
 * RBAC: STUDENT role (account owner manages their child profiles)
 *
 * GET  /api/students/profiles — List all profiles for the current user
 * POST /api/students/profiles — Create a new child profile
 *
 * Business Rule: Siblings plan allows up to 3 profiles. Other plans allow 1.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { studentProfiles, subscriptions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, BusinessRuleError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";

const createProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  dateOfBirth: z.string().datetime().optional(),
  currentLevel: z.string().default("qaida-basics"),
  notes: z.string().max(500).optional(),
});

/** GET /api/students/profiles */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["STUDENT"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const profiles = await db.query.studentProfiles.findMany({
      where: eq(studentProfiles.userId, ctx.userId),
      with: {
        progressRecords: {
          orderBy: (pr, { desc }) => [desc(pr.createdAt)],
          limit: 5,
        },
      },
      orderBy: asc(studentProfiles.createdAt),
    });

    return NextResponse.json({ profiles });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/students/profiles */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["STUDENT"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const data = createProfileSchema.parse(body);

    // Check profile limit based on subscription
    const subscription = await db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, ctx.userId), eq(subscriptions.status, "ACTIVE")),
      with: { plan: true },
    });

    const maxProfiles = subscription?.plan.maxStudents ?? 1;
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, ctx.userId));

    const currentCount = countResult?.count ?? 0;

    if (currentCount >= maxProfiles) {
      throw new BusinessRuleError(
        `Your plan allows up to ${maxProfiles} student profile(s). ` +
        `Upgrade to the Siblings plan for up to 3 profiles.`
      );
    }

    const [profile] = await db.insert(studentProfiles).values({
      userId: ctx.userId,
      name: data.name,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      currentLevel: data.currentLevel,
      notes: data.notes,
    }).returning();

    await logAudit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "USER_CREATED",
      target: `profile:${profile.id}`,
      metadata: { profileName: data.name },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
