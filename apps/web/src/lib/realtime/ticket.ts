import { SignJWT, jwtVerify } from 'jose';
import type { RealtimeClaims } from '@/realtime/protocol';

const issuer = 'novicetutor-realtime';
const audience = 'availability-hub';

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function createRealtimeTicket(claims: RealtimeClaims, secret: string) {
  return new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(key(secret));
}

export async function verifyRealtimeTicket(ticket: string, secret: string): Promise<RealtimeClaims> {
  const { payload } = await jwtVerify(ticket, key(secret), { issuer, audience });
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