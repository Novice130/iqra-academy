/**
 * @fileoverview LiveKit Room Ops API
 *
 * RBAC: ORG_ADMIN, SUPER_ADMIN
 * GET  /api/admin/livekit-rooms — List every room currently open on
 *      LiveKit Cloud (this is the actual billing source of truth — a room
 *      can be open here even if its DB session was marked COMPLETED).
 * POST /api/admin/livekit-rooms { action: "end-all" | "end", roomName? } —
 *      Force-close rooms. "end-all" disconnects everyone in every open
 *      room of every org — SUPER_ADMIN only, and only when nothing should
 *      legitimately be live.
 *      Responds { success: true, ended: string[] }.
 *
 * ORG SCOPE: LiveKit has one project for every org, so its room list is
 * everyone's. An ORG_ADMIN sees and ends only rooms whose session is in their
 * org (lib/admin-ops resolveRoomSessions); a room with no session at all is
 * SUPER_ADMIN only. Ending a room outside scope answers 403.
 *
 * Ending a room makes LiveKit send room_finished, and that webhook is what
 * marks the class COMPLETED — hence the SESSION_COMPLETED audit action.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { handleApiError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { getRoomServiceClient } from "@/lib/livekit";
import { logAudit, logAuditBatch, getClientIp } from "@/lib/audit";
import { resolveRoomSessions, roomVisibleTo } from "@/lib/admin-ops";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("end"), roomName: z.string().min(1).max(200) }),
  z.object({ action: z.literal("end-all") }),
]);

export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const rooms = await getRoomServiceClient().listRooms();
      const matches = await resolveRoomSessions(rooms.map((r) => r.name));

      return NextResponse.json({
        rooms: rooms
          .filter((r) => roomVisibleTo(ctx, matches.get(r.name)))
          .map((r) => ({
            name: r.name,
            numParticipants: r.numParticipants,
            creationTime: r.creationTime ? new Date(Number(r.creationTime) * 1000).toISOString() : null,
          })),
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

      const body = bodySchema.parse(await request.json().catch(() => ({})));
      const svc = getRoomServiceClient();
      const ip = getClientIp(request.headers);

      if (body.action === "end") {
        const match = (await resolveRoomSessions([body.roomName])).get(body.roomName);
        if (!roomVisibleTo(ctx, match)) {
          throw new ForbiddenError(match ? "That room belongs to another organisation." : "Only a super admin can end a room with no matching class.");
        }

        // Already closed (emptyTimeout, or another admin got there first):
        // say so plainly instead of a 500.
        await svc.deleteRoom(body.roomName).catch((err: unknown) => {
          if ((err as { status?: number })?.status === 404) throw new NotFoundError("Room");
          throw err;
        });
        await logAudit({
          orgId: match?.orgId ?? ctx.orgId,
          actorId: ctx.userId,
          action: "SESSION_COMPLETED",
          target: match ? `session:${match.sessionId}` : `room:${body.roomName}`,
          metadata: { op: "livekit.end_room", roomName: body.roomName, sessionStatus: match?.status ?? null },
          ipAddress: ip,
        });
        return NextResponse.json({ success: true, ended: [body.roomName] });
      }

      // Every org's rooms at once: not something an ORG_ADMIN may do.
      if (ctx.role !== "SUPER_ADMIN") throw new ForbiddenError("Only a super admin can end every room.");

      const rooms = await svc.listRooms();
      const matches = await resolveRoomSessions(rooms.map((r) => r.name));
      const targets = rooms.map((r) => r.name);

      const results = await Promise.allSettled(targets.map((name) => svc.deleteRoom(name)));
      const ended = targets.filter((_, i) => results[i].status === "fulfilled");

      if (ended.length > 0) {
        await logAuditBatch(
          ended.map((name) => {
            const match = matches.get(name);
            return {
              orgId: match?.orgId ?? ctx.orgId,
              actorId: ctx.userId,
              action: "SESSION_COMPLETED" as const,
              target: match ? `session:${match.sessionId}` : `room:${name}`,
              metadata: { op: "livekit.end_room", bulk: true, roomName: name, sessionStatus: match?.status ?? null },
              ipAddress: ip,
            };
          })
        );
      }
      return NextResponse.json({ success: true, ended });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
