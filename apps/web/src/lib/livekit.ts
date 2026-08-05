import { AccessToken } from "livekit-server-sdk";

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

  // Identity must be unique in the room. email or a fallback is used.
  const identity = userEmail || `${userName}-${Math.random().toString(36).slice(2, 6)}`;

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
