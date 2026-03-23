/**
 * @fileoverview Jitsi JWT Room Integration
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * Jitsi is an open-source video conferencing platform (like Zoom, but free).
 * We self-host it, which means we control the servers and data.
 *
 * JWT AUTHENTICATION FOR JITSI:
 * By default, anyone can join any Jitsi room (it's open). That's not acceptable
 * for a Quran school — we need to ensure only authorized students/teachers
 * can join a room. We solve this with JWTs (JSON Web Tokens):
 *
 * 1. Student clicks "Join Session" → our server generates a JWT
 * 2. The JWT contains: who they are, which room, what permissions (moderator/participant)
 * 3. The JWT is signed with a secret shared between our server and Jitsi
 * 4. Jitsi validates the JWT before letting them in
 *
 * WHY JWT AND NOT PASSWORDS?
 * - JWTs are time-limited (expire after 2 hours)
 * - JWTs carry permissions (moderator vs. participant)
 * - JWTs can't be reused across rooms
 * - No passwords to remember or leak
 *
 * @module lib/jitsi
 */

import { SignJWT } from "jose";

/**
 * Jitsi configuration from environment variables.
 * These must match your Jitsi server's JWT configuration.
 */
const JITSI_CONFIG = {
  /** Your Jitsi server domain (e.g., "meet.yourschool.com") */
  domain: process.env.JITSI_DOMAIN || "meet.jitsi",
  /** Application ID — matches Jitsi's JWT app_id setting */
  appId: process.env.JITSI_APP_ID || "quran-lms",
  /** Secret key shared between our app and Jitsi for signing JWTs */
  secret: process.env.JITSI_JWT_SECRET || "",
};

/**
 * Parameters for generating a Jitsi room JWT.
 */
export interface JitsiRoomParams {
  /** The Jitsi room name (must be unique per session) */
  roomName: string;
  /** Display name shown in the Jitsi UI */
  userName: string;
  /** User's email (shown in Jitsi participant list) */
  userEmail: string;
  /** User's avatar URL */
  userAvatar?: string;
  /** Whether this user is the moderator (teacher) or participant (student) */
  isModerator: boolean;
  /** JWT expiration time in seconds (default: 2 hours = 7200) */
  expiresInSeconds?: number;
}

/**
 * Generates a JWT for secure Jitsi room access.
 *
 * 📚 JWT STRUCTURE EXPLAINED:
 * A JWT has three parts: Header.Payload.Signature
 *
 * HEADER: { "alg": "HS256", "typ": "JWT" }
 *   → Tells Jitsi which algorithm was used to sign
 *
 * PAYLOAD (our claims):
 *   - iss: "quran-lms" (who issued this token — us)
 *   - sub: "meet.jitsi" (the Jitsi domain)
 *   - room: "session_abc123" (which room this grants access to)
 *   - moderator: true/false (can the user mute others, kick people, etc.)
 *   - exp: 1234567890 (when this token expires — Unix timestamp)
 *   - context.user: { name, email, avatar } (user info for Jitsi's UI)
 *
 * SIGNATURE: HMAC-SHA256(header + payload, secret)
 *   → Proves this JWT was created by us (anyone with the secret can verify)
 *
 * SECURITY CONSIDERATIONS:
 * - Room names are derived from session IDs (unpredictable)
 * - JWTs expire after 2 hours (a session should never be that long)
 * - Only moderators (teachers) can unmute, kick, or start recordings
 * - The secret must be at least 32 characters
 *
 * @param params - Room and user parameters
 * @returns Signed JWT string
 *
 * FAILURE MODES:
 * - Missing JITSI_JWT_SECRET → JWT signing fails with error
 * - Expired JWT → Jitsi rejects the user at join time
 * - Wrong secret → Jitsi rejects all JWTs (misconfiguration)
 */
export async function generateJitsiJwt(
  params: JitsiRoomParams
): Promise<string> {
  const {
    roomName,
    userName,
    userEmail,
    userAvatar,
    isModerator,
    expiresInSeconds = 7200, // 2 hours default
  } = params;

  // Encode the secret as bytes (required by jose library)
  const secret = new TextEncoder().encode(JITSI_CONFIG.secret);

  /**
   * Build and sign the JWT.
   *
   * 📚 WHY `jose` LIBRARY?
   * The `jose` library is the standard for JWT operations in modern JS.
   * It's small, has no dependencies, works in Edge runtimes (Vercel),
   * and handles the crypto correctly. Never implement JWT signing yourself!
   */
  const jwt = await new SignJWT({
    /** Jitsi-specific claims */
    room: roomName,
    moderator: isModerator,
    /** User context — displayed in Jitsi's UI */
    context: {
      user: {
        name: userName,
        email: userEmail,
        avatar: userAvatar || "",
      },
      /** Feature flags for this user's session */
      features: {
        /** Only moderators (teachers) can start recordings */
        recording: isModerator,
        /** Only moderators can livestream */
        livestreaming: isModerator,
        /** Screen sharing — available to all (for showing Quran pages) */
        "screen-sharing": true,
      },
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(JITSI_CONFIG.appId)
    .setSubject(JITSI_CONFIG.domain)
    .setAudience(JITSI_CONFIG.appId)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(secret);

  return jwt;
}

/**
 * Generates a Jitsi room name from a session ID.
 *
 * 📚 WHY NOT JUST USE THE SESSION ID?
 * 1. Session IDs (CUIDs) contain characters that Jitsi might not like
 * 2. Adding a prefix helps identify our rooms in Jitsi logs
 * 3. The room name is visible in the URL — we want it clean but unique
 *
 * FORMAT: "qlms-{sessionId}" (e.g., "qlms-clk2m1x0z0000")
 *
 * @param sessionId - Our database session ID
 * @returns A Jitsi-safe room name
 */
export function generateRoomName(sessionId: string): string {
  return `qlms-${sessionId}`;
}

/**
 * Builds the full Jitsi meeting URL for a room.
 *
 * @param roomName - The room name (from generateRoomName)
 * @param jwt - The signed JWT
 * @returns Full URL to join the meeting
 *
 * EXAMPLE: "https://meet.yourschool.com/qlms-clk2m1x0z0000?jwt=eyJhbGci..."
 */
export function buildJitsiUrl(roomName: string, jwt: string): string {
  return `https://${JITSI_CONFIG.domain}/${roomName}?jwt=${jwt}`;
}
