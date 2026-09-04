/**
 * @fileoverview Room metadata — the call's shared, room-wide state.
 *
 * LiveKit gives a room one string of metadata, broadcast to every participant
 * and handed to anyone who joins later. That makes it the right home for
 * settings that are the same for everyone in the class: which participant is
 * spotlighted, and how loud each student is.
 *
 * THE REASON THIS FILE EXISTS: `updateRoomMetadata` replaces the whole string.
 * The spotlight route used to write `JSON.stringify({ spotlightIdentity })`
 * outright, which was harmless only for as long as spotlight was the sole key.
 * The moment a second key existed, every spotlight change would have silently
 * wiped every volume the teacher had set. Read, merge, write — always.
 */

import { getRoomServiceClient } from "@/lib/livekit";

export interface RoomMetadata {
  /** Whose tile is pinned to the main view for everyone. */
  spotlightIdentity?: string | null;
  /**
   * Per-student playback volume, 0–1, keyed by **base** identity (the part
   * before the '#'). Identities are per connection, so keying on the full one
   * would lose the setting the moment a student's phone reconnected.
   *
   * Absent key means full volume. The teacher sets this and it applies on
   * every client — turning a student down is a decision about the class, not
   * about one person's ears.
   */
  volumes?: Record<string, number>;
  /** Meeting lock: prevents new guest knocks and entry */
  isLocked?: boolean;
  /** Participant sharing policy: whether non-hosts can share screen */
  allowParticipantShare?: boolean;
}

/** Parse room metadata, tolerating the empty and the malformed. */
export function parseRoomMetadata(raw: string | undefined | null): RoomMetadata {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as RoomMetadata) : {};
  } catch {
    return {};
  }
}

/**
 * Merge `patch` into the room's existing metadata.
 *
 * Shallow by design: `volumes` is replaced wholesale, so a caller changing one
 * student's volume must pass the full map it wants (the volume route reads the
 * current metadata to build it). Deep-merging would make "remove this key"
 * impossible to express.
 *
 * Returns the metadata as written. Throws if the room doesn't exist — the
 * callers are host actions on a live call, and silently doing nothing there
 * would look to the teacher exactly like it had worked.
 */
export async function patchRoomMetadata(
  roomName: string,
  patch: RoomMetadata
): Promise<RoomMetadata> {
  const svc = getRoomServiceClient();
  const rooms = await svc.listRooms([roomName]);
  const current = parseRoomMetadata(rooms[0]?.metadata);
  const next = { ...current, ...patch };
  await svc.updateRoomMetadata(roomName, JSON.stringify(next));
  return next;
}
