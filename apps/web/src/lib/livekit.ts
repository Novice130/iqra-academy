import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const LIVEKIT_CONFIG = {
  host: process.env.LIVEKIT_URL || "wss://meet.novicetutor.com",
  apiKey: process.env.LIVEKIT_API_KEY || "",
  apiSecret: process.env.LIVEKIT_API_SECRET || "",
};

export interface LiveKitRoomParams {
  roomName: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  isModerator: boolean;
  expiresInSeconds?: number;
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
  } = params;

  if (!LIVEKIT_CONFIG.apiKey || !LIVEKIT_CONFIG.apiSecret) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured");
  }

  // Identity must be unique *per connection*, not per person. LiveKit closes
  // an existing participant when a new one joins with the same identity, so
  // using the bare email meant a teacher opening the room on their phone
  // silently kicked their own laptop out of the class. The email stays as the
  // prefix — everything that reasons about "who is this" (spotlight, the
  // default-focus backfill) matches on the part before the '#', which an
  // email address can never contain.
  const base = userEmail || userName;
  const identity = `${base}#${Math.random().toString(36).slice(2, 8)}`;

  const token = new AccessToken(LIVEKIT_CONFIG.apiKey, LIVEKIT_CONFIG.apiSecret, {
    identity,
    name: userName,
    metadata: JSON.stringify({ email: userEmail, avatar: userAvatar || "" }),
    ttl: `${expiresInSeconds}s`,
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true, // required for chat
    roomAdmin: isModerator,
  });

  return await token.toJwt();
}

export function generateRoomName(sessionId: string): string {
  return `qlms-${sessionId}`;
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
