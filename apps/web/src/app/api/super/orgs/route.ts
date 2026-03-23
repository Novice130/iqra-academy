/**
 * @fileoverview Super Admin Organization Management API
 *
 * RBAC: SUPER_ADMIN role
 * GET  /api/super/orgs — List all organizations
 * POST /api/super/orgs — Create a new organization (tenant)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, isNull, desc } from "drizzle-orm";
import { organizations } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, ConflictError } from "@/lib/errors";

const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase dash-separated"),
  domain: z.string().optional(),
  timezone: z.string().default("America/New_York"),
});

/** GET /api/super/orgs — list all organizations (super admin only) */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["SUPER_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;

    const orgs = await db.query.organizations.findMany({
      where: isNull(organizations.deletedAt),
      orderBy: desc(organizations.createdAt),
    });

    return NextResponse.json({ organizations: orgs });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/super/orgs — create a new organization */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["SUPER_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const data = createOrgSchema.parse(body);

    // Check slug uniqueness
    const existing = await db.query.organizations.findFirst({
      where: eq(organizations.slug, data.slug),
    });
    if (existing) throw new ConflictError(`Organization with slug "${data.slug}" already exists.`);

    const [org] = await db.insert(organizations).values(data).returning();

    return NextResponse.json({ organization: org }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
