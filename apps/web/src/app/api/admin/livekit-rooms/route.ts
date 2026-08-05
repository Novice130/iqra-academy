/**
 * @fileoverview LiveKit Room Ops API
 *
 * RBAC: ORG_ADMIN, SUPER_ADMIN
 * GET  /api/admin/livekit-rooms — List every room currently open on
 *      LiveKit Cloud (this is the actual billing source of truth — a room
 *      can be open here even if its DB session was marked COMPLETED).
 * POST /api/admin/livekit-rooms { action: "end-all" | "end", roomName? } —
 *      Force-close rooms. "end-all" disconnects everyone in every open
 *      room — only use it when nothing should legitimately be live.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { handleApiError, BusinessRuleError } from "@/lib/errors";
import { getRoomServiceClient } from "@/lib/livekit";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN", "SUPER_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;

    const rooms = await getRoomServiceClient().listRooms();

    return NextResponse.json({
      rooms: rooms.map((r) => ({
        name: r.name,
        numParticipants: r.numParticipants,
        creationTime: r.creationTime ? new Date(Number(r.creationTime) * 1000).toISOString() : null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN", "SUPER_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json().catch(() => ({}));
    const { action, roomName } = body || {};

    const svc = getRoomServiceClient();

    if (action === "end") {
      if (typeof roomName !== "string") throw new BusinessRuleError("roomName is required for action 'end'");
      await svc.deleteRoom(roomName);
      return NextResponse.json({ success: true, ended: [roomName] });
    }

    if (action === "end-all") {
      const rooms = await svc.listRooms();
      await Promise.all(rooms.map((r) => svc.deleteRoom(r.name).catch(() => {})));
      return NextResponse.json({ success: true, ended: rooms.map((r) => r.name) });
    }

    throw new BusinessRuleError("action must be 'end' or 'end-all'");
  } catch (error) {
    return handleApiError(error);
  }
}
