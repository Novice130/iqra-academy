/**
 * @fileoverview Record an admin's follow-up on a trial class.
 *
 * RBAC: ORG_ADMIN and above.
 * PATCH /api/admin/trials — { sessionId, followUp: "NONE" | "CONTACTED" | "DECLINED", note? }
 *
 * Everything else about a trial's pipeline stage is derived (see
 * lib/admin-students loadTrialPipeline). The follow-up is the one fact only a
 * person knows, and there is no column for it — the schema is frozen while
 * the deployment moves. So the record *is* an audit row: USER_UPDATED with
 * `metadata.op = "trial.status"`, newest wins. That keeps a full history of
 * who marked what, which a status column would have overwritten.
 *
 * Because that row is the state, it is inserted here directly rather than
 * through logAudit: logAudit swallows failures by design, and a follow-up the
 * UI reports as saved but that never landed is exactly the false screen the
 * overhaul is meant to remove.
 *
 * Cancelling, rescheduling and marking a no-show are not here — they live on
 * the class itself at /admin/sessions/[id], which notifies and cleans up.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { db, withDb } from "@/lib/db";
import { auditLogs, sessions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { getClientIp } from "@/lib/audit";
import { TRIAL_FOLLOW_UPS, TRIAL_FOLLOW_UP_OP } from "@/app/admin/trials/stages";

const patchSchema = z.object({
  sessionId: z.string().min(1),
  followUp: z.enum(TRIAL_FOLLOW_UPS),
  note: z.string().trim().max(500).optional().nullable(),
});

export async function PATCH(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = patchSchema.parse(await request.json().catch(() => ({})));

      const trial = await db.query.sessions.findFirst({
        where: and(
          eq(sessions.id, data.sessionId),
          or(eq(sessions.isTrial, true), eq(sessions.origin, "TRIAL")),
          ctx.role === "SUPER_ADMIN" ? undefined : eq(sessions.orgId, ctx.orgId)
        ),
        columns: { id: true, orgId: true },
      });
      // Same answer for "not a trial" and "another org's trial": no existence leak.
      if (!trial) throw new NotFoundError("Trial");

      const note = data.note ? data.note : null;
      const [row] = await db
        .insert(auditLogs)
        .values({
          orgId: trial.orgId,
          actorId: ctx.userId,
          action: "USER_UPDATED",
          target: `session:${trial.id}`,
          metadata: { op: TRIAL_FOLLOW_UP_OP, followUp: data.followUp, note },
          ipAddress: getClientIp(request.headers),
        })
        .returning({ createdAt: auditLogs.createdAt });

      return NextResponse.json({
        followUp: { value: data.followUp, at: row.createdAt.toISOString(), by: ctx.name, note },
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
