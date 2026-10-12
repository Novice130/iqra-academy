import { createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { RealtimeClaims } from '@/realtime/protocol';

const issuer = 'novicetutor-realtime';
const audience = 'availability-hub';

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

/**
 * Service secret shared by the ticket issuer, the realtime sidecar's publish
 * endpoint, and the drain trigger. Fail-closed: throws when unset, and every
 * caller turns that into a 401/503, so a missing env var is a loud outage
 * rather than an open door. There is deliberately no fallback value — a
 * default that lives in git is a credential anyone can read. The test suite
 * sets REALTIME_SECRET explicitly (see realtime.spec.ts).
 */
export function getRealtimeSecret(): string {
  const secret = process.env.REALTIME_SECRET;
  if (!secret) {
    throw new Error('REALTIME_SECRET is not set.');
  }
  return secret;
}

/**
 * Constant-time check of an `Authorization` header against the service
 * secret. Both sides are hashed first so the comparison never leaks the
 * secret's length either.
 */
export function isServiceAuthorized(authHeader: string | null | undefined, secret: string): boolean {
  if (!authHeader || !secret) return false;
  const given = createHash('sha256').update(authHeader).digest();
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
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