/**
 * @fileoverview Session Volume API — how loud one student is, for everyone.
 *
 * RBAC: host only (session owner or org admin)
 * POST /api/sessions/[id]/volume  { identity: string, volume: number }
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A LOCAL SETTING: the teacher asked for a
 * quieter alternative to muting — "carry on practising out loud, I'm listening
 * to the others now" — and was explicit that turning a student down should
 * turn them down *for the whole class*, not just in the teacher's own ears. So
 * it is room state, like the spotlight, and it lives in the room's metadata
 * where LiveKit broadcasts it to everyone and hands it to whoever joins later.
 *
 * Host-only is enforced here rather than by hiding the slider, precisely
 * because it changes what every other person hears.
 *
 * `identity` is a **base** identity (the part before the '#'). Identities are
 * per connection, so keying on the full one would lose the setting the moment
 * a student's phone dropped and reconnected.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";
import { parseRoomMetadata, patchRoomMetadata } from "@/lib/room-metadata";

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

      const body = await request.json().catch(() => ({}));
      const identity = body?.identity;
      const volume = body?.volume;
      if (typeof identity !== "string" || !identity) {
        throw new BusinessRuleError("identity is required");
      }
      if (typeof volume !== "number" || Number.isNaN(volume)) {
        throw new BusinessRuleError("volume must be a number between 0 and 1");
      }

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });
      if (!session) throw new NotFoundError("Session");

      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
      });
      const isAdmin = user ? ["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role) : false;
      const isHost = session.teacherId === ctx.userId || isAdmin;

      if (!isHost) {
        throw new ForbiddenError("Only the host can change a participant's volume.");
      }

      // Above 1 does nothing — `setVolume` lands on HTMLMediaElement.volume,
      // which clamps. Better to reject the impossible than to store a boost
      // the room will silently ignore.
      const clamped = Math.min(1, Math.max(0, volume));

      const roomName = generateRoomName(sessionId);
      // Read-modify-write on the map itself: `patchRoomMetadata` merges at the
      // top level only, so the caller has to hand it the whole `volumes`.
      const rooms = await getRoomServiceClient().listRooms([roomName]);
      const current = parseRoomMetadata(rooms[0]?.metadata);
      const volumes = { ...(current.volumes ?? {}) };

      // Full volume is the default, so store nothing — otherwise the map grows
      // an entry for every student the teacher ever turned down and back up.
      if (clamped >= 1) delete volumes[identity];
      else volumes[identity] = clamped;

      await patchRoomMetadata(roomName, { volumes });

      return NextResponse.json({ success: true, identity, volume: clamped });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
