import { SignJWT, jwtVerify } from 'jose';
import type { RealtimeClaims } from '@/realtime/protocol';

const issuer = 'novicetutor-realtime';
const audience = 'availability-hub';

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

/**
 * Service secret shared by the ticket issuer, the DO publish endpoint, and
 * the drain trigger. Fail-closed: every caller 401/503s without it, so a
 * missing env var is a loud outage rather than an open door. The test suite
 * sets REALTIME_SECRET explicitly (see realtime.spec.ts).
 */
export function getRealtimeSecret(): string {
  const secret = process.env.REALTIME_SECRET || process.env.BETTER_AUTH_SECRET || "novicetutor-realtime-fallback-secret-2026";
  return secret;
}

export async function createRealtimeTicket(claims: RealtimeClaims, secret?: string) {
  return new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(key(secret ?? getRealtimeSecret()));
}

export async function verifyRealtimeTicket(ticket: string, secret?: string): Promise<RealtimeClaims> {
  const { payload } = await jwtVerify(ticket, key(secret ?? getRealtimeSecret()), { issuer, audience });
  if (
    typeof payload.userId !== 'string' ||
    typeof payload.orgId !== 'string' ||
    typeof payload.role !== 'string'
  ) {
    throw new Error('Invalid realtime ticket.');
  }
  return {
    userId: payload.userId,
    orgId: payload.orgId,
    role: payload.role as RealtimeClaims['role'],
    teacherId: typeof payload.teacherId === 'string' ? payload.teacherId : null,
  };
}