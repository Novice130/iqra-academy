/**
 * @fileoverview Admin user management API.
 *
 * RBAC: ORG_ADMIN and above.
 * GET    /api/admin/users[?role=&search=]  — list users
 * POST   /api/admin/users                  — add a user, or re-role one whose email already exists
 * PATCH  /api/admin/users                  — change a user's name, phone or role
 * DELETE /api/admin/users?userId=          — soft-delete a user
 *
 * SCOPE: an ORG_ADMIN reads and writes their own org; a SUPER_ADMIN may act
 * on any org (the admin pages show them every org). A target outside the
 * caller's scope is a 404, so an id from another org reads the same as one
 * that doesn't exist.
 *
 * Guards every write shares, in `loadTarget` and `assertMayManage`:
 *   - **The root admin** (lib/root-admin.ts) can't be changed or deleted by
 *     anyone else, and never demoted. Checked before the org check so the
 *     answer is a 403 wherever the account lives.
 *   - **Nobody changes their own role or deletes themselves.** The only
 *     ORG_ADMIN demoting themselves locks every human out of /admin, and the
 *     way back is hand-written SQL.
 *   - **A privilege ceiling.** Both the target's current role and any role
 *     being granted must sit at or below the caller's own.
 *   - **Soft-deleted users stay deleted** except through POST, which restores
 *     a removed account when it is added again (the email is unique per org,
 *     so restoring is the only way to add them back).
 *
 * Audit rows are written after the transaction commits, so a rolled-back
 * write never leaves an audit entry claiming it happened.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRLS, withDb } from "@/lib/db";
import { and, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireRole, ROLE_HIERARCHY, type AuthContext } from "@/lib/rbac";
import { ROLES, type UserRole } from "@/lib/roles";
import { handleApiError, NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { isRootAdminEmail } from "@/lib/root-admin";
import { isValidZone } from "@/lib/zones";

const roleSchema = z.enum(ROLES as [UserRole, ...UserRole[]]);

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  name: z.string().trim().min(1, "Name can't be empty.").max(100, "Name is too long.").optional(),
  role: z.enum(["STUDENT", "TEACHER", "ORG_ADMIN"]).default("TEACHER"),
  phone: z.string().trim().max(40, "Phone number is too long.").optional(),
  timezone: z
    .string()
    .trim()
    .refine((tz) => tz === "" || isValidZone(tz), "Unknown time zone.")
    .optional(),
});

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1, "Name can't be empty.").max(100, "Name is too long.").optional(),
  role: roleSchema.optional(),
  phone: z.string().trim().max(40, "Phone number is too long.").optional(),
});

const listQuerySchema = z.object({
  role: roleSchema.optional(),
  search: z.string().trim().max(100).optional(),
});

/** The transaction handle withRLS passes in. */
type Tx = Parameters<Parameters<typeof withRLS>[1]>[0];

const isSuper = (ctx: AuthContext) => ctx.role === "SUPER_ADMIN";

/** `column = orgId` for an ORG_ADMIN, nothing for a SUPER_ADMIN. */
function scope(ctx: AuthContext): SQL | undefined {
  return isSuper(ctx) ? undefined : eq(users.orgId, ctx.orgId);
}

/** A user the caller may see, root-admin check first (see the header). */
async function loadTarget(tx: Tx, ctx: AuthContext, userId: string, action: string) {
  const target = await tx.query.users.findFirst({
    where: and(eq(users.id, userId), isNull(users.deletedAt)),
    columns: { id: true, orgId: true, role: true, name: true, email: true },
  });
  if (!target) throw new NotFoundError("User");
  if (isRootAdminEmail(target.email) && target.id !== ctx.userId) {
    throw new ForbiddenError(`The root admin account can't be ${action}.`);
  }
  if (!isSuper(ctx) && target.orgId !== ctx.orgId) throw new NotFoundError("User");
  return target;
}

function assertMayManage(ctx: AuthContext, targetRole: UserRole, grantRole?: UserRole) {
  const callerLevel = ROLE_HIERARCHY[ctx.role];
  if (ROLE_HIERARCHY[targetRole] > callerLevel) {
    throw new ForbiddenError("You can't change someone whose role is above your own.");
  }
  if (grantRole && ROLE_HIERARCHY[grantRole] > callerLevel) {
    throw new ForbiddenError("You can't grant a role above your own.");
  }
}

async function notifyNewTeacher(orgId: string, userId: string) {
  await notify({
    orgId,
    userIds: [userId],
    type: "ROLE_GRANTED",
    title: "You're now a teacher at Novice Tutor",
    body: "Set the weekly hours you're available, so students can book you.",
    path: "/dashboard/teacher/availability",
  });
}

/** Escape LIKE wildcards so a search for "50%" means the text "50%". */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const params = new URL(request.url).searchParams;
      const query = listQuerySchema.parse({
        role: params.get("role") || undefined,
        search: params.get("search") || undefined,
      });

      return await withRLS(ctx, async (tx) => {
        const conditions: (SQL | undefined)[] = [scope(ctx), isNull(users.deletedAt)];
        if (query.role) conditions.push(eq(users.role, query.role));
        if (query.search) {
          const p = likePattern(query.search);
          conditions.push(or(ilike(users.name, p), ilike(users.email, p), ilike(users.phone, p)));
        }

        const result = await tx
          .select({
            id: users.id,
            orgId: users.orgId,
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

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = createUserSchema.parse(await request.json());
      if (isRootAdminEmail(data.email)) {
        throw new ForbiddenError("The root admin account can't be modified or re-created.");
      }
      assertMayManage(ctx, "STUDENT", data.role);

      // New users always join the caller's own org; a SUPER_ADMIN adding to
      // another org does it from inside that org.
      const result = await withRLS(ctx, async (tx) => {
        const existing = await tx.query.users.findFirst({
          where: and(eq(users.email, data.email), eq(users.orgId, ctx.orgId)),
          columns: { id: true, role: true, deletedAt: true },
        });

        if (existing) {
          if (existing.id === ctx.userId) {
            throw new ForbiddenError("You can't change your own role. Ask another admin to do it.");
          }
          assertMayManage(ctx, existing.role, data.role);
          const [user] = await tx
            .update(users)
            .set({
              role: data.role,
              deletedAt: null,
              ...(data.name ? { name: data.name } : {}),
              ...(data.phone ? { phone: data.phone } : {}),
              ...(data.timezone ? { timezone: data.timezone } : {}),
            })
            .where(eq(users.id, existing.id))
            .returning();
          return { user, previousRole: existing.role, restored: existing.deletedAt !== null, created: false };
        }

        const [user] = await tx
          .insert(users)
          .values({
            email: data.email,
            name: data.name || data.email.split("@")[0],
            role: data.role,
            phone: data.phone || null,
            timezone: data.timezone || null,
            orgId: ctx.orgId,
          })
          .returning();
        return { user, previousRole: null, restored: false, created: true };
      });

      await logAudit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: result.created || result.restored ? "USER_CREATED" : "ROLE_CHANGED",
        target: `user:${result.user.id}`,
        metadata: {
          op: result.created ? "user.create" : result.restored ? "user.restore" : "user.promote",
          email: data.email,
          role: data.role,
          previousRole: result.previousRole,
        },
        ipAddress: getClientIp(request.headers),
      });

      if (!result.created && data.role === "TEACHER" && result.previousRole !== "TEACHER") {
        await notifyNewTeacher(ctx.orgId, result.user.id);
      }

      return NextResponse.json(
        { user: result.user, promoted: !result.created, restored: result.restored },
        { status: result.created ? 201 : 200 }
      );
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function PATCH(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = updateUserSchema.parse(await request.json());

      const updates: Partial<typeof users.$inferInsert> = {};
      // `!== undefined`, not truthiness: "" is how the UI clears a phone number.
      if (data.name !== undefined) updates.name = data.name;
      if (data.role !== undefined) updates.role = data.role;
      if (data.phone !== undefined) updates.phone = data.phone === "" ? null : data.phone;
      if (Object.keys(updates).length === 0) throw new BusinessRuleError("Nothing to update.");

      if (data.role && data.userId === ctx.userId && data.role !== ctx.role) {
        throw new ForbiddenError("You can't change your own role. Ask another admin to do it.");
      }

      const result = await withRLS(ctx, async (tx) => {
        const target = await loadTarget(tx, ctx, data.userId, "modified by other users");
        if (isRootAdminEmail(target.email) && data.role && data.role !== "SUPER_ADMIN") {
          throw new ForbiddenError("The root admin account can't be demoted.");
        }
        assertMayManage(ctx, target.role, data.role);

        const [user] = await tx
          .update(users)
          .set(updates)
          .where(and(eq(users.id, target.id), eq(users.orgId, target.orgId), isNull(users.deletedAt)))
          .returning();
        if (!user) throw new NotFoundError("User");
        return { user, target };
      });

      await logAudit({
        orgId: result.target.orgId,
        actorId: ctx.userId,
        action: data.role && data.role !== result.target.role ? "ROLE_CHANGED" : "USER_UPDATED",
        target: `user:${result.user.id}`,
        metadata: { op: "user.update", changes: data, previousRole: result.target.role },
        ipAddress: getClientIp(request.headers),
      });

      // After the commit: notify() makes network calls that must not hold a
      // Postgres transaction open.
      if (data.role === "TEACHER" && result.target.role !== "TEACHER") {
        await notifyNewTeacher(result.target.orgId, result.user.id);
      }

      return NextResponse.json({ user: result.user });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const userId = new URL(request.url).searchParams.get("userId");
      if (!userId) throw new BusinessRuleError("userId is required.");
      if (userId === ctx.userId) throw new ForbiddenError("You can't remove your own account.");

      const target = await withRLS(ctx, async (tx) => {
        const target = await loadTarget(tx, ctx, userId, "deleted");
        assertMayManage(ctx, target.role);

        // A removed teacher's upcoming classes would still be on students'
        // calendars with nobody to teach them. Make the admin move them first.
        const [{ upcoming }] = await tx
          .select({ upcoming: sql<number>`count(*)::int`.mapWith(Number) })
          .from(sessions)
          .where(
            and(
              eq(sessions.teacherId, target.id),
              eq(sessions.orgId, target.orgId),
              inArray(sessions.status, ["SCHEDULED", "IN_PROGRESS"]),
              gte(sessions.scheduledStart, new Date())
            )
          );
        if (upcoming > 0) {
          throw new BusinessRuleError(
            `${target.name || target.email} teaches ${upcoming} upcoming class${upcoming === 1 ? "" : "es"}. Reassign or cancel them first.`
          );
        }

        await tx
          .update(users)
          .set({ deletedAt: new Date() })
          .where(and(eq(users.id, target.id), eq(users.orgId, target.orgId)));
        return target;
      });

      await logAudit({
        orgId: target.orgId,
        actorId: ctx.userId,
        action: "USER_DELETED",
        target: `user:${target.id}`,
        metadata: { op: "user.delete", email: target.email, role: target.role },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
