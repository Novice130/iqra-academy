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
import { withRLS, withDb } from "@/lib/db";
import { eq, and, isNull, ilike, or, desc } from "drizzle-orm";
import { users } from "@/db/schema";
import { requireRole, ROLE_HIERARCHY } from "@/lib/rbac";
import {
  handleApiError,
  NotFoundError,
  ForbiddenError,
  BusinessRuleError,
} from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { notify } from "@/lib/notify";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["STUDENT", "TEACHER", "ORG_ADMIN"]).default("TEACHER"),
  phone: z.string().optional(),
  timezone: z.string().optional(),
});

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["STUDENT", "TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]).optional(),
  phone: z.string().max(40).optional(),
});

/** GET /api/admin/users — list all org users */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { searchParams } = new URL(request.url);
      const role = searchParams.get("role");
      const search = searchParams.get("search");

      return await withRLS(ctx, async (tx) => {
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

        const result = await tx
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            phone: users.phone,
            timezone: users.timezone,
            createdAt: users.createdAt,
            emailVerified: users.emailVerified,
          })
          .from(users)
          .where(and(...conditions))
          .orderBy(desc(users.createdAt));

        return NextResponse.json({ users: result });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/** POST /api/admin/users — create or add a teacher/user in the org */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const data = createUserSchema.parse(body);

      return await withRLS(ctx, async (tx) => {
        // Check existing user within org
        const existing = await tx.query.users.findFirst({
          where: and(eq(users.email, data.email.toLowerCase().trim()), eq(users.orgId, ctx.orgId)),
        });

        if (existing) {
          const [updated] = await tx
            .update(users)
            .set({
              role: data.role as typeof users.role.enumValues[number],
              ...(data.name ? { name: data.name } : {}),
              ...(data.timezone ? { timezone: data.timezone } : {}),
            })
            .where(eq(users.id, existing.id))
            .returning();

          await logAudit({
            orgId: ctx.orgId,
            actorId: ctx.userId,
            action: "ROLE_CHANGED",
            target: `user:${existing.id}`,
            metadata: { email: data.email, role: data.role, promoted: true },
            ipAddress: getClientIp(request.headers),
          });

          return NextResponse.json({ user: updated, promoted: true }, { status: 200 });
        }

        const fallbackName = data.name || data.email.split("@")[0];
        const [user] = await tx
          .insert(users)
          .values({
            email: data.email.toLowerCase().trim(),
            name: fallbackName,
            role: data.role as typeof users.role.enumValues[number],
            phone: data.phone,
            timezone: data.timezone || "America/New_York",
            orgId: ctx.orgId,
          })
          .returning();

        await logAudit({
          orgId: ctx.orgId,
          actorId: ctx.userId,
          action: "USER_CREATED",
          target: `user:${user.id}`,
          metadata: { email: data.email, role: data.role },
          ipAddress: getClientIp(request.headers),
        });

        return NextResponse.json({ user, promoted: false }, { status: 201 });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/**
 * PATCH /api/admin/users — update a user, including their role.
 *
 * The three guards below are the reason this handler is longer than it looks
 * like it should be:
 *
 *   1. **No self-demotion.** The only ORG_ADMIN setting their own role to
 *      STUDENT locks every human out of /admin, and there is no in-app way
 *      back — the recovery is a hand-written SQL statement against Neon.
 *   2. **A privilege ceiling.** Without it an ORG_ADMIN can demote a
 *      SUPER_ADMIN in their org. Both the target's current role and the role
 *      being granted must sit at or below the caller's own level.
 *   3. **Soft-deleted users stay deleted.** GET filters them; this did not, so
 *      a role change quietly resurrected a deleted user's permissions.
 */
export async function PATCH(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const data = updateUserSchema.parse(body);

      const updates: Record<string, unknown> = {};
      // `!== undefined`, not truthiness: "" is how the UI clears a phone
      // number, and truthiness silently dropped it.
      if (data.name !== undefined) updates.name = data.name;
      if (data.role !== undefined) updates.role = data.role;
      if (data.phone !== undefined) updates.phone = data.phone === "" ? null : data.phone;

      if (Object.keys(updates).length === 0) {
        throw new BusinessRuleError("Nothing to update.");
      }

      const callerLevel = ROLE_HIERARCHY[ctx.role];

      if (data.role && data.userId === ctx.userId && data.role !== ctx.role) {
        throw new ForbiddenError(
          "You can't change your own role. Ask another admin to do it."
        );
      }

      const result = await withRLS(ctx, async (tx) => {
        // Read the target first: the ceiling depends on the role they hold
        // now, not only on the one being granted.
        const target = await tx.query.users.findFirst({
          where: and(
            eq(users.id, data.userId),
            eq(users.orgId, ctx.orgId),
            isNull(users.deletedAt)
          ),
          columns: { id: true, role: true, name: true, email: true },
        });
        if (!target) throw new NotFoundError("User");

        if (ROLE_HIERARCHY[target.role] > callerLevel) {
          throw new ForbiddenError("You can't modify someone above your own role.");
        }
        if (data.role && ROLE_HIERARCHY[data.role] > callerLevel) {
          throw new ForbiddenError("You can't grant a role above your own.");
        }

        const [user] = await tx
          .update(users)
          .set(updates)
          .where(
            and(
              eq(users.id, data.userId),
              eq(users.orgId, ctx.orgId),
              isNull(users.deletedAt)
            )
          )
          .returning();

        if (!user) throw new NotFoundError("User");

        await logAudit({
          orgId: ctx.orgId, actorId: ctx.userId,
          action: data.role ? "ROLE_CHANGED" : "USER_UPDATED",
          target: `user:${user.id}`,
          metadata: { changes: data, previousRole: target.role },
          ipAddress: getClientIp(request.headers),
        });

        return { user, becameTeacher: data.role === "TEACHER" && target.role !== "TEACHER" };
      });

      // Deliberately AFTER the transaction commits. notify() makes an HTTP
      // round trip to Resend and to FCM; awaiting that inside withRLS would
      // hold a Postgres interactive transaction open for the length of a
      // network call, on a Worker.
      if (result.becameTeacher) {
        await notify({
          orgId: ctx.orgId,
          userIds: [result.user.id],
          type: "ROLE_GRANTED",
          title: "You're now a teacher at Novice Tutor",
          body: "Set the weekly hours you're available, so students can book you.",
          path: "/dashboard/teacher/availability",
        });
      }

      return NextResponse.json({ user: result.user });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
