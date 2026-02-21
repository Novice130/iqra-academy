/**
 * @fileoverview Admin User Management API
 *
 * RBAC: ORG_ADMIN role
 * GET   /api/admin/users — List all users in the org
 * POST  /api/admin/users — Create a new user (teacher or student)
 * PATCH /api/admin/users — Update a user's role or details
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, and, isNull, ilike, or, sql, desc } from "drizzle-orm";
import { users, studentProfiles, bookings } from "@/db/schema";
import { requireRole, orgScope } from "@/lib/rbac";
import { handleApiError, ConflictError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(["STUDENT", "TEACHER"]),
  phone: z.string().optional(),
});

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["STUDENT", "TEACHER", "ORG_ADMIN"]).optional(),
  phone: z.string().optional(),
});

/** GET /api/admin/users — list all org users */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const search = searchParams.get("search");

    const conditions = [
      eq(users.orgId, ctx.orgId),
      isNull(users.deletedAt),
    ];
    if (role) conditions.push(eq(users.role, role as typeof users.role.enumValues[number]));
    if (search) {
      conditions.push(or(
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`),
      )!);
    }

    const result = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        phone: users.phone,
        createdAt: users.createdAt,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt));

    return NextResponse.json({ users: result });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/admin/users — create a user in the org */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const data = createUserSchema.parse(body);

    // Check duplicate email within org
    const existing = await db.query.users.findFirst({
      where: and(eq(users.email, data.email), eq(users.orgId, ctx.orgId)),
    });
    if (existing) throw new ConflictError("A user with this email already exists in your organization.");

    const [user] = await db.insert(users).values({
      ...data,
      role: data.role as typeof users.role.enumValues[number],
      orgId: ctx.orgId,
    }).returning();

    await logAudit({
      orgId: ctx.orgId, actorId: ctx.userId,
      action: "USER_CREATED", target: `user:${user.id}`,
      metadata: { email: data.email, role: data.role },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/admin/users — update a user */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const data = updateUserSchema.parse(body);

    const updates: Record<string, unknown> = {};
    if (data.name) updates.name = data.name;
    if (data.role) updates.role = data.role;
    if (data.phone) updates.phone = data.phone;

    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, data.userId))
      .returning();

    await logAudit({
      orgId: ctx.orgId, actorId: ctx.userId,
      action: data.role ? "ROLE_CHANGED" : "USER_UPDATED",
      target: `user:${user.id}`,
      metadata: { changes: data },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
