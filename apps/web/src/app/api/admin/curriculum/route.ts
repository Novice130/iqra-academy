/**
 * @fileoverview Admin curriculum: the lessons teachers record progress against.
 *
 * RBAC: ORG_ADMIN and above.
 * GET  /api/admin/curriculum[?orgId=] — the org's lessons, inactive included,
 *      with how many students completed each
 * POST /api/admin/curriculum — append a lesson to a track
 * PATCH /api/admin/curriculum/[id] — edit, move, deactivate (see [id]/route.ts)
 *
 * Lessons belong to one org and are ordered within a track, so a list that
 * mixed orgs would be meaningless. An ORG_ADMIN always works on their own org;
 * a SUPER_ADMIN may name another with `orgId`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, withDb } from "@/lib/db";
import { organizations } from "@/db/schema";
import { requireRole, type AuthContext } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { createLesson, lessonFieldsSchema, listCurriculum, trackSchema } from "@/lib/admin-curriculum";

const createSchema = lessonFieldsSchema.extend({
  track: trackSchema,
  /** SUPER_ADMIN only; ignored for anyone else. */
  orgId: z.string().min(1).max(64).optional(),
});

/** The org this request acts on, checked to exist when a SUPER_ADMIN names one. */
async function targetOrg(ctx: AuthContext, requested: string | null | undefined): Promise<string> {
  if (ctx.role !== "SUPER_ADMIN" || !requested || requested === ctx.orgId) return ctx.orgId;
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, requested),
    columns: { id: true },
  });
  if (!org) throw new NotFoundError("Organization");
  return org.id;
}

export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const orgId = await targetOrg(authResult, request.nextUrl.searchParams.get("orgId"));
      return NextResponse.json({ orgId, lessons: await listCurriculum(orgId) });
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

      const { track, orgId: requested, ...fields } = createSchema.parse(await request.json());
      const orgId = await targetOrg(ctx, requested);

      const lesson = await createLesson(orgId, track, fields);

      await logAudit({
        orgId,
        actorId: ctx.userId,
        action: "SETTINGS_CHANGED",
        target: `lesson:${lesson.id}`,
        metadata: { op: "curriculum.create", track, sortOrder: lesson.sortOrder, title: lesson.title },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ lesson }, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
