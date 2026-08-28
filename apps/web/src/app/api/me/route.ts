/**
 * @fileoverview Who the caller is.
 *
 * RBAC: any signed-in user, about themselves only.
 * GET /api/me — id, name, email, role, org and timezone
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The web app never needed it: a server component already has the auth
 * context by the time it renders, so nothing had to ask over HTTP. A native
 * client has no such thing. It signs in against Better Auth, gets a session
 * cookie back, and from that learns only what Better Auth stores — id, email,
 * name, image. `role` and `orgId` live in our own `users` columns, which
 * Better Auth does not return, and the whole shape of the app depends on
 * role: a teacher opens a roster, a student opens their own schedule.
 *
 * Sending the role on every screen's response instead would mean each of them
 * carrying identity it has no other reason to know. One call, once, on launch.
 *
 * Deliberately not an admin lookup — there is no `userId` parameter. Reading
 * somebody else's row is what api/admin/users is for.
 */

import { NextRequest, NextResponse } from "next/server";
import { withHttpDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  // A single indexed read of one row, no transaction — exactly what the HTTP
  // driver exists for. See docs/worker-limits.md.
  return withHttpDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
          orgId: true,
          timezone: true,
          image: true,
        },
      });
      if (!user) throw new NotFoundError("User");

      return NextResponse.json({ user });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function PATCH(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const updateData: Record<string, any> = { updatedAt: new Date() };

      if (typeof body.name === "string" && body.name.trim().length > 0) {
        updateData.name = body.name.trim();
      }
      if (typeof body.phone === "string") {
        updateData.phone = body.phone.trim();
      }

      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, ctx.userId))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          orgId: users.orgId,
          timezone: users.timezone,
        });

      return NextResponse.json({ user: updated });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

