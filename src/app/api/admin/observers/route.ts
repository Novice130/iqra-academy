/**
 * @fileoverview Admin Observer Email Configuration API
 *
 * RBAC: ORG_ADMIN or STUDENT (students manage their own observers)
 * GET  /api/admin/observers — List observer emails
 * POST /api/admin/observers — Add an observer email
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { observerEmails } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";

const observerSchema = z.object({
  email: z.string().email("Must be a valid email"),
  profileIds: z.array(z.string()).default([]),
  frequency: z.enum(["weekly", "daily"]).default("weekly"),
});

/** GET /api/admin/observers — list observer emails for the current user */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
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
}

/** POST /api/admin/observers — add an observer email */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const data = observerSchema.parse(body);

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
}
