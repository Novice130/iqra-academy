/**
 * @fileoverview Host Tools API — room-wide security & moderation controls.
 *
 * RBAC: host only (the session's teacher, or an org/super admin)
 * POST /api/sessions/[id]/host-tools
 *
 * Actions:
 * - lock: toggle whether the meeting is locked (blocks fresh guest knocks / joins)
 * - participantShare: toggle whether participants are permitted to share screens
 * - muteAll: force-mutes audio tracks of all remote participants in the room
 */

import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, BusinessRuleError } from "@/lib/errors";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";
import { parseRoomMetadata, patchRoomMetadata } from "@/lib/room-metadata";
import { loadOrgSession, assertSessionHost } from "@/lib/session-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;

      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      assertSessionHost(session, ctx);

      const body = await request.json().catch(() => ({}));
      const { action, value } = body || {};

      const roomName = generateRoomName(sessionId);
      const roomClient = getRoomServiceClient();

      if (action === "lock") {
        if (typeof value !== "boolean") {
          throw new BusinessRuleError("value must be boolean for lock action");
        }
        const updated = await patchRoomMetadata(roomName, { isLocked: value });
        return NextResponse.json({ success: true, isLocked: updated.isLocked });
      }

      if (action === "participantShare") {
        if (typeof value !== "boolean") {
          throw new BusinessRuleError("value must be boolean for participantShare action");
        }
        const updated = await patchRoomMetadata(roomName, { allowParticipantShare: value });
        return NextResponse.json({ success: true, allowParticipantShare: updated.allowParticipantShare });
      }

      if (action === "muteAll") {
        // Find all remote participants in the room and mute their microphone tracks
        const participants = await roomClient.listParticipants(roomName);
        const hostIdentity = ctx.userId;

        const mutePromises: Promise<any>[] = [];
        for (const p of participants) {
          // Do not mute the host themselves
          if (p.identity.startsWith(hostIdentity)) continue;
          for (const track of p.tracks) {
            if (track.type === 0 && !track.muted) {
              // TrackType.AUDIO = 0
              mutePromises.push(
                roomClient.mutePublishedTrack(roomName, p.identity, track.sid, true).catch(() => {})
              );
            }
          }
        }
        await Promise.all(mutePromises);
        return NextResponse.json({ success: true, mutedCount: mutePromises.length });
      }

      throw new BusinessRuleError(`Unknown action '${action}'. Expected lock, participantShare, or muteAll.`);
    } catch (error) {
      return handleApiError(error);
    }
  });
}
