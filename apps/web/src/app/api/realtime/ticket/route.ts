import { NextRequest, NextResponse } from 'next/server';
import { withHttpDb } from '@/lib/db';
import { requireAuth } from '@/lib/rbac';
import { createRealtimeTicket, getRealtimeSecret } from '@/lib/realtime/ticket';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return withHttpDb(async () => {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    let secret: string;
    try {
      secret = getRealtimeSecret();
    } catch {
      return NextResponse.json({ error: 'Realtime is not configured.' }, { status: 503 });
    }
    const ticket = await createRealtimeTicket(
      {
        userId: auth.userId,
        orgId: auth.orgId,
        role: auth.role,
        teacherId: auth.role === 'TEACHER' ? auth.userId : null,
      },
      secret
    );
    return NextResponse.json({ ticket }, { headers: { 'Cache-Control': 'no-store' } });
  });
}