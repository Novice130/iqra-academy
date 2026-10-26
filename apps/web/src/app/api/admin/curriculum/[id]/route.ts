/**
 * @fileoverview Change one lesson.
 *
 * RBAC: ORG_ADMIN and above; an ORG_ADMIN only reaches their own org's.
 * PATCH /api/admin/curriculum/[id] with one of
 *   { op: "update", title?, description?, objectives?, estimatedMinutes? }
 *   { op: "move", direction: "up" | "down" }
 *   { op: "deactivate" } | { op: "reactivate" }
 *
 * There is deliberately no DELETE. Progress records reference the lesson and
 * a family's history must keep resolving, so a lesson is retired by
 * deactivating it: it leaves the teacher's picker and the progress totals,
 * and can be brought back.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { handleApiError, BusinessRuleError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import {
  findLessonForAdmin,
  lessonEditSchema,
  moveLesson,
  setLessonActive,
  updateLesson,
} from "@/lib/admin-curriculum";

const patchSchema = z.discriminatedUnion("op", [
  lessonEditSchema.extend({ op: z.literal("update") }),
  z.object({ op: z.literal("move"), direction: z.enum(["up", "down"]) }),
  z.object({ op: z.literal("deactivate") }),
  z.object({ op: z.literal("reactivate") }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { id } = await params;
      const body = patchSchema.parse(await request.json());
      const lesson = await findLessonForAdmin(id, ctx.role === "SUPER_ADMIN" ? null : ctx.orgId);

      const audit = (metadata: Record<string, unknown>) =>
        logAudit({
          orgId: lesson.orgId,
          actorId: ctx.userId,
          action: "SETTINGS_CHANGED",
          target: `lesson:${lesson.id}`,
          metadata: { track: lesson.track, title: lesson.title, ...metadata },
          ipAddress: getClientIp(request.headers),
        });

      switch (body.op) {
        case "update": {
          const fields = {
            title: body.title,
            description: body.description,
            objectives: body.objectives,
            estimatedMinutes: body.estimatedMinutes,
          };
          const changes: Record<string, { from: unknown; to: unknown }> = {};
          for (const [key, to] of Object.entries(fields) as [keyof typeof fields, unknown][]) {
            if (to === undefined) continue;
            const from = lesson[key];
            if (JSON.stringify(from ?? null) !== JSON.stringify(to)) changes[key] = { from, to };
          }
          if (Object.keys(changes).length === 0) return NextResponse.json({ lesson });
          const updated = await updateLesson(lesson, fields);
          await audit({ op: "curriculum.update", changes });
          return NextResponse.json({ lesson: updated });
        }
        case "move": {
          const swappedWith = await moveLesson(lesson, body.direction);
          if (!swappedWith) {
            throw new BusinessRuleError(
              body.direction === "up" ? "This is already the first lesson." : "This is already the last lesson."
            );
          }
          await audit({ op: "curriculum.reorder", direction: body.direction, swappedWith });
          return NextResponse.json({ ok: true });
        }
        case "deactivate":
        case "reactivate": {
          const isActive = body.op === "reactivate";
          if (lesson.isActive === isActive) return NextResponse.json({ lesson });
          const updated = await setLessonActive(lesson, isActive);
          await audit(
            isActive
              ? { op: "curriculum.update", changes: { isActive: { from: false, to: true } } }
              : { op: "curriculum.deactivate" }
          );
          return NextResponse.json({ lesson: updated });
        }
      }
    } catch (error) {
      return handleApiError(error);
    }
  });
}
