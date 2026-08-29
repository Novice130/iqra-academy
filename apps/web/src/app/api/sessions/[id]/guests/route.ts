/**
 * @fileoverview Guest Admission API — the host side of knock-to-join.
 *
 * RBAC: host only (the session's teacher, or an org/super admin)
 * GET  /api/sessions/[id]/guests — who is waiting at the door
 * POST /api/sessions/[id]/guests — { requestId, action: "admit" | "deny" }
 *
 * Admitting is what actually grants access; the guest's own endpoint only
 * mints a token once the row says ADMITTED. See /api/guest/join.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb, withHttpDb } from "@/lib/db";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { guestJoinRequests, sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";
import { resolveClassRoom } from "@/lib/class-room";

/** Knocks older than this are stale — nobody is still sitting there waiting. */
const KNOCK_WINDOW_MS = 10 * 60 * 1000;

function normalizeJoinCode(code: string) {
  if (!code) return code;
  const trimmed = code.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 12) {
    return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 9)}-${digitsOnly.slice(9, 12)}`;
  }
  const clean = trimmed.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (clean.length === 12) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
  }
  return trimmed;
}

async function assertHost(request: NextRequest, sessionIdRaw: string) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return { response: authResult };
  const ctx = authResult;

  const sessionId = normalizeJoinCode(sessionIdRaw);
  const rawTrimmed = (sessionIdRaw || "").trim();
  const rawClean = rawTrimmed.replace(/[\s-]/g, "");

  const session = await db.query.sessions.findFirst({
    where: or(
      eq(sessions.id, sessionId),
      eq(sessions.joinCode, sessionId),
      eq(sessions.joinCode, rawTrimmed),
      eq(sessions.joinCode, rawClean),
      eq(sessions.id, rawTrimmed),
      eq(sessions.id, rawClean)
    ),
    with: { bookings: true },
  });
  if (!session) throw new NotFoundError("Session");

  return { session, ctx };
}

// Over HTTP, not the WebSocket pool: this is the most-polled endpoint in the
// app — once per host every few seconds for the length of every class — and
// nothing in it opens a transaction. The POST below stays on the pool.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHttpDb(async () => {
    try {
      const { id: sessionId } = await params;
      const guard = await assertHost(request, sessionId);
      if ("response" in guard) return guard.response;

      // Check canonical session ID to catch knocks on sibling occurrence links
      const resolution = await resolveClassRoom(guard.session);
      const canonicalId = resolution.session.id;
      const targetSessionIds = Array.from(
        new Set([sessionId, guard.session.id, canonicalId, guard.session.mergedIntoId].filter(Boolean) as string[])
      );

      const pending = await db.query.guestJoinRequests.findMany({
        where: and(
          inArray(guestJoinRequests.sessionId, targetSessionIds),
          eq(guestJoinRequests.status, "PENDING")
        ),
        orderBy: [desc(guestJoinRequests.createdAt)],
      });

      const cutoff = new Date(Date.now() - KNOCK_WINDOW_MS);
      const waiting = pending.filter((g) => g.createdAt >= cutoff);

      if (waiting.length < pending.length) {
        await db
          .update(guestJoinRequests)
          .set({ status: "EXPIRED" })
          .where(
            and(
              inArray(guestJoinRequests.sessionId, targetSessionIds),
              eq(guestJoinRequests.status, "PENDING"),
              lt(guestJoinRequests.createdAt, cutoff)
            )
          );
      }

      return NextResponse.json({
        guests: waiting.map((g) => ({ id: g.id, name: g.name, askedAt: g.createdAt.toISOString() })),
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const { id: sessionId } = await params;
      const guard = await assertHost(request, sessionId);
      if ("response" in guard) return guard.response;

      const body = await request.json().catch(() => ({}));
      const { requestId, action } = body || {};
      if (typeof requestId !== "string" || (action !== "admit" && action !== "deny")) {
        throw new BusinessRuleError('requestId and action ("admit" | "deny") are required');
      }

      const req = await db.query.guestJoinRequests.findFirst({
        where: eq(guestJoinRequests.id, requestId),
      });
      if (!req) throw new NotFoundError("Request");
      // Only a live knock can be answered. Re-admitting an already-answered
      // row would reset its clock, which is what bounds the guest's token.
      if (req.status !== "PENDING") {
        throw new BusinessRuleError("That request has already been answered.");
      }

      const resolution = await resolveClassRoom(guard.session);
      const targetSessionIds = Array.from(
        new Set([sessionId, guard.session.id, resolution.session.id, guard.session.mergedIntoId].filter(Boolean) as string[])
      );

      // Admit/Deny the target request AND any duplicate pending knocks for the same guest name
      await db
        .update(guestJoinRequests)
        .set({ status: action === "admit" ? "ADMITTED" : "DENIED", respondedAt: new Date() })
        .where(
          and(
            inArray(guestJoinRequests.sessionId, targetSessionIds),
            eq(guestJoinRequests.name, req.name),
            eq(guestJoinRequests.status, "PENDING")
          )
        );

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
