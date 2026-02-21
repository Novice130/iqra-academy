/**
 * @fileoverview Admin CSV Export API
 *
 * RBAC: ORG_ADMIN role
 * GET /api/admin/exports?type=users|bookings — Download CSV export
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, isNull } from "drizzle-orm";
import { users, bookings, sessions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";

/** GET /api/admin/exports — generate CSV export */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const type = new URL(request.url).searchParams.get("type") || "users";
    let csv = "";

    switch (type) {
      case "users": {
        const result = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            phone: users.phone,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(and(eq(users.orgId, ctx.orgId), isNull(users.deletedAt)));

        csv = "ID,Name,Email,Role,Phone,Created\n" +
          result.map((u) => `${u.id},${u.name},${u.email},${u.role},${u.phone || ""},${u.createdAt.toISOString()}`).join("\n");
        break;
      }
      case "bookings": {
        const result = await db.query.bookings.findMany({
          where: eq(bookings.orgId, ctx.orgId),
          with: {
            user: { columns: { name: true, email: true } },
            session: { columns: { title: true, scheduledStart: true, type: true } },
          },
        });

        csv = "ID,Student,Email,Session,Type,Date,Status\n" +
          result.map((b) =>
            `${b.id},${b.user.name},${b.user.email},${b.session.title || ""},${b.session.type},${b.session.scheduledStart.toISOString()},${b.status}`
          ).join("\n");
        break;
      }
      default:
        return NextResponse.json({ error: "Invalid export type. Use: users, bookings" }, { status: 400 });
    }

    await logAudit({
      orgId: ctx.orgId, actorId: ctx.userId,
      action: "EXPORT_GENERATED", target: `export:${type}`,
      ipAddress: getClientIp(request.headers),
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=${type}-export-${Date.now()}.csv`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
