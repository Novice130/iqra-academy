/**
 * @fileoverview Incoming Call Poll API
 *
 * RBAC: any authenticated user
 * GET /api/calls/incoming — Callee polls this on a fast interval to detect
 * a ringing call addressed to them. Only considers calls from the last 60s
 * so a stale ring doesn't resurrect after the caller gave up.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withHttpDb } from "@/lib/db";
import { callInvites, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { and, desc, eq, gt } from "drizzle-orm";

const RING_WINDOW_MS = 60_000;

/**
 * Same reason as `students/live-class`: URLSession heuristically caches a
 * response that carries no cache directives, and a stale "no call" is a phone
 * that never rings.
 */
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function GET(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const cutoff = new Date(Date.now() - RING_WINDOW_MS);

      const call = await db.query.callInvites.findFirst({
        where: and(
          eq(callInvites.calleeId, ctx.userId),
          eq(callInvites.status, "RINGING"),
          gt(callInvites.createdAt, cutoff)
        ),
        orderBy: [desc(callInvites.createdAt)],
      });

      if (!call) return NextResponse.json({ call: null }, { headers: NO_STORE });

      const caller = await db.query.users.findFirst({
        where: eq(users.id, call.callerId),
        columns: { name: true },
      });

      return NextResponse.json(
        {
          call: {
            id: call.id,
            sessionId: call.sessionId,
            callerName: caller?.name || "Your teacher",
          },
        },
        { headers: NO_STORE }
      );
    } catch (error) {
      return handleApiError(error);
    }
  });
}
