import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const LIVEKIT_CONFIG = {
  host: process.env.LIVEKIT_URL || "wss://meet.novicetutor.com",
  apiKey: process.env.LIVEKIT_API_KEY || "devkey",
  apiSecret: process.env.LIVEKIT_API_SECRET || "secret",
};

export interface LiveKitRoomParams {
  roomName: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  isModerator: boolean;
  expiresInSeconds?: number;
  /**
   * Marks this connection as a screen-share publisher rather than a person.
   *
   * The Android app cannot screen share through the WebView — Android's
   * WebView has no `getDisplayMedia` at all — so the native shell joins the
   * same room a second time and publishes the captured screen there. That
   * connection is a camera-less, deaf publisher: it sends one video track and
   * subscribes to nothing, because the WebView next to it is already
   * receiving the class and paying for it twice would be wasteful on a phone.
   */
  screenShare?: boolean;
  /**
   * Use this exact identity instead of minting one.
   *
   * The join API needs to know which identity it just handed out so it can
   * write an attendance row against it and have the `participant_left`
   * webhook find that row again. Everything else can let this be minted here.
   */
  identity?: string;
}

/**
 * Build a LiveKit identity for one connection.
 *
 * Identity must be unique *per connection*, not per person. LiveKit closes an
 * existing participant when a new one joins with the same identity, so using
 * the bare email meant a teacher opening the room on their phone silently
 * kicked their own laptop out of the class. The email stays as the prefix —
 * everything that reasons about "who is this" (spotlight, attendance, the
 * default-focus backfill) matches on the part before the '#', which an email
 * address can never contain.
 *
 * The suffix stays random even for the screen publisher: a teacher who stops
 * and restarts sharing must not collide with the connection LiveKit has not
 * finished tearing down, or the new share closes the old one and then itself.
 * `screen-` only makes it recognisable in the room list.
 */
export function makeIdentity(base: string, screenShare = false): string {
  const suffix = `${screenShare ? "screen-" : ""}${Math.random().toString(36).slice(2, 8)}`;
  return `${base}#${suffix}`;
}

/** The part of an identity before the '#' — the person, not the connection. */
export function baseIdentity(identity: string): string {
  return identity.split("#")[0];
}

/** True for the Android shell's separate screen-publishing connection, which is not a person. */
export function isScreenShareIdentity(identity: string): boolean {
  return identity.includes("#screen-");
}

export async function generateLiveKitToken(
  params: LiveKitRoomParams
): Promise<string> {
  const {
    roomName,
    userName,
    userEmail,
    userAvatar,
    isModerator,
    expiresInSeconds = 7200, // 2 hours default
    screenShare = false,
  } = params;

  if (!LIVEKIT_CONFIG.apiKey || !LIVEKIT_CONFIG.apiSecret) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured");
  }

  // See `makeIdentity` for why this is per connection rather than per person.
  const identity = params.identity ?? makeIdentity(userEmail || userName, screenShare);

  const token = new AccessToken(LIVEKIT_CONFIG.apiKey, LIVEKIT_CONFIG.apiSecret, {
    identity,
    name: userName,
    metadata: JSON.stringify({ email: userEmail, avatar: userAvatar || "", screenShare }),
    ttl: `${expiresInSeconds}s`,
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    // The screen publisher is deliberately deaf — see `screenShare` above.
    canSubscribe: !screenShare,
    canPublishData: !screenShare, // required for chat
    roomAdmin: isModerator && !screenShare,
  });

  return await token.toJwt();
}

export function generateRoomName(sessionId: string): string {
  return `qlms-${sessionId}`;
}

/** The inverse of `generateRoomName`, for webhooks that only know the room. */
export function sessionIdFromRoomName(roomName: string): string | null {
  return roomName.startsWith("qlms-") ? roomName.slice("qlms-".length) : null;
}

let roomServiceClient: RoomServiceClient | null = null;

export function getRoomServiceClient(): RoomServiceClient {
  if (!roomServiceClient) {
    if (!LIVEKIT_CONFIG.apiKey || !LIVEKIT_CONFIG.apiSecret) {
      throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured");
    }
    const httpHost = LIVEKIT_CONFIG.host.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
    roomServiceClient = new RoomServiceClient(httpHost, LIVEKIT_CONFIG.apiKey, LIVEKIT_CONFIG.apiSecret);
  }
  return roomServiceClient;
}
