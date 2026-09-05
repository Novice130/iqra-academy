/**
 * @fileoverview Breakout Rooms API — host-managed small-group rooms.
 *
 * RBAC: host only (session teacher, same-org ORG_ADMIN, SUPER_ADMIN)
 * GET  /api/sessions/[id]/breakouts — open/draft set with rooms + assignments
 * POST /api/sessions/[id]/breakouts — { action: "create", rooms: [{ title }] }
 *   | { action: "open" } | { action: "close" }
 *   | { action: "assign", assignments: [{ roomId, userId? }] }
 *   | { action: "move-token", roomId } — signed child-room token for one participant
 *
 * Each breakout room maps to its own LiveKit room (`qlms-<session>-b-<roomId>`).
 * Parent attendance rows carry breakout context; closing marks every open
 * assignment returned. Child-room tokens are short-lived (15 min) and scoped
 * to the single breakout room — they never grant parent-room access.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, withDb } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";
import {
  breakoutAssignments,
  breakoutRooms,
  breakoutSets,
  sessionAttendance,
} from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, BusinessRuleError, NotFoundError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";
import { loadOrgSession, assertSessionHost, assertSessionViewer } from "@/lib/session-access";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";
import { createId } from "@paralleldrive/cuid2";

const createSchema = z.object({
  action: z.literal("create"),
  rooms: z.array(z.object({ title: z.string().min(1).max(80) })).min(1).max(20),
});

const openSchema = z.object({ action: z.literal("open") });
const closeSchema = z.object({ action: z.literal("close") });
const assignSchema = z.object({
  action: z.literal("assign"),
  assignments: z
    .array(
      z.object({
        roomId: z.string().min(1),
        userId: z.string().min(1).optional(),
        participantIdentity: z.string().min(1).optional(),
      })
    )
    .min(1)
    .max(100),
});
const moveTokenSchema = z.object({ action: z.literal("move-token"), roomId: z.string().min(1) });

function breakoutRoomName(sessionId: string, roomId: string) {
  return `${generateRoomName(sessionId)}-b-${roomId.slice(0, 8)}`;
}

type ActiveSet = typeof breakoutSets.$inferSelect & {
  rooms: Array<typeof breakoutRooms.$inferSelect & { assignments: Array<typeof breakoutAssignments.$inferSelect> }>;
};

async function getActiveSet(sessionId: string, orgId: string): Promise<ActiveSet | undefined> {
  const sets = await db.query.breakoutSets.findMany({
    where: and(eq(breakoutSets.sessionId, sessionId), eq(breakoutSets.orgId, orgId)),
    with: {
      rooms: {
        orderBy: [asc(breakoutRooms.sortOrder)],
        with: { assignments: true },
      },
    },
  });
  const sorted = (sets as unknown as ActiveSet[]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return sorted[0];
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;
      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      assertSessionViewer(session, ctx);
      const set = await getActiveSet(session.id, session.orgId);
      if (!set) return NextResponse.json({ set: null });
      const mine = (set.rooms ?? []).flatMap((r) => r.assignments ?? []).find(
        (a) => a.userId === ctx.userId
      );
      return NextResponse.json({
        set: {
          id: set.id,
          status: set.status,
          rooms: (set.rooms ?? []).map((r) => ({
            id: r.id,
            title: r.title,
            videoRoomName: r.videoRoomName,
            assignments: (r.assignments ?? []).map((a) => ({
              userId: a.userId,
              participantIdentity: a.participantIdentity,
              joinedAt: a.joinedAt,
              returnedAt: a.returnedAt,
            })),
          })),
        },
        myAssignment: mine ? { roomId: mine.breakoutRoomId, returnedAt: mine.returnedAt } : null,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;
      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      const body = await request.json().catch(() => ({}));
      const action = body?.action;

      if (action === "move-token") {
        const parsed = moveTokenSchema.parse(body);
        assertSessionViewer(session, ctx);
        const [room] = await db
          .select()
          .from(breakoutRooms)
          .where(and(eq(breakoutRooms.id, parsed.roomId), eq(breakoutRooms.orgId, session.orgId)))
          .limit(1);
        if (!room) throw new NotFoundError("Breakout room");
        const set = await db.query.breakoutSets.findFirst({
          where: and(eq(breakoutSets.id, room.breakoutSetId), eq(breakoutSets.orgId, session.orgId)),
        });
        if (!set || set.status !== "OPEN" || set.sessionId !== session.id) {
          throw new BusinessRuleError("Breakout room is not open");
        }
        const assigned = await db.query.breakoutAssignments.findFirst({
          where: and(
            eq(breakoutAssignments.breakoutRoomId, room.id),
            eq(breakoutAssignments.orgId, session.orgId),
            eq(breakoutAssignments.userId, ctx.userId)
          ),
        });
        const host = (() => {
          try {
            assertSessionHost(session, ctx);
            return true;
          } catch {
            return false;
          }
        })();
        if (!assigned && !host) throw new BusinessRuleError("You are not assigned to this breakout room");
        const roomName = room.videoRoomName || breakoutRoomName(session.id, room.id);
        const token = await generateLiveKitToken({
          roomName,
          userName: ctx.userId,
          userEmail: ctx.userId,
          isModerator: host,
          expiresInSeconds: 900,
        });
        await db
          .update(breakoutAssignments)
          .set({ joinedAt: new Date() })
          .where(
            and(
              eq(breakoutAssignments.breakoutRoomId, room.id),
              eq(breakoutAssignments.orgId, session.orgId),
              eq(breakoutAssignments.userId, ctx.userId)
            )
          )
          .catch(() => {});
        return NextResponse.json({ token, roomName, roomId: room.id });
      }

      assertSessionHost(session, ctx);

      if (action === "create") {
        const parsed = createSchema.parse(body);
        const [set] = await db
          .insert(breakoutSets)
          .values({ id: createId(), orgId: session.orgId, sessionId: session.id, status: "DRAFT" })
          .returning();
        const rows = parsed.rooms.map((r, i) => ({
          id: createId(),
          orgId: session.orgId,
          breakoutSetId: set.id,
          title: r.title,
          videoRoomName: breakoutRoomName(session.id, `${set.id}-${i}`),
          sortOrder: i,
        }));
        await db.insert(breakoutRooms).values(rows);
        await insertSchedulingEvent(db, {
          orgId: session.orgId,
          teacherId: session.teacherId,
          actorId: ctx.userId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: session.id,
        }).catch(() => {});
        return NextResponse.json({ success: true, setId: set.id, rooms: rows.map((r) => ({ id: r.id, title: r.title })) });
      }

      if (action === "open" || action === "close") {
        if (action === "open") openSchema.parse(body);
        else closeSchema.parse(body);
        const set = await getActiveSet(session.id, session.orgId);
        if (!set) throw new NotFoundError("Breakout set");
        const next = action === "open" ? "OPEN" : "CLOSED";
        await db.transaction(async (tx) => {
          await tx
            .update(breakoutSets)
            .set({
              status: next,
              openedAt: action === "open" ? new Date() : undefined,
              closedAt: action === "close" ? new Date() : undefined,
            })
            .where(and(eq(breakoutSets.id, set.id), eq(breakoutSets.orgId, session.orgId)));
          if (action === "close") {
            const roomIds = (set.rooms ?? []).map((r) => r.id);
            for (const roomId of roomIds) {
              await tx
                .update(breakoutAssignments)
                .set({ returnedAt: new Date() })
                .where(
                  and(eq(breakoutAssignments.breakoutRoomId, roomId), eq(breakoutAssignments.orgId, session.orgId))
                )
                .catch(() => {});
            }
            await tx
              .update(sessionAttendance)
              .set({ breakoutRoomName: null })
              .where(and(eq(sessionAttendance.sessionId, session.id), eq(sessionAttendance.orgId, session.orgId)))
              .catch(() => {});
          }
          await insertSchedulingEvent(tx, {
            orgId: session.orgId,
            teacherId: session.teacherId,
            actorId: ctx.userId,
            type: "session.changed",
            aggregateType: "session",
            aggregateId: session.id,
          });
        });
        afterResponse(drainOutbox({ orgId: session.orgId }).catch(() => {}));
        return NextResponse.json({ success: true, status: next });
      }

      if (action === "assign") {
        const parsed = assignSchema.parse(body);
        const set = await getActiveSet(session.id, session.orgId);
        if (!set) throw new NotFoundError("Breakout set");
        if (set.status === "CLOSED") throw new BusinessRuleError("Breakout set is closed");
        const validRoomIds = new Set((set.rooms ?? []).map((r) => r.id));
        for (const a of parsed.assignments) {
          if (!validRoomIds.has(a.roomId)) throw new BusinessRuleError("Unknown breakout room");
        }
        await db.transaction(async (tx) => {
          for (const a of parsed.assignments) {
            await tx.insert(breakoutAssignments).values({
              id: createId(),
              orgId: session.orgId,
              breakoutRoomId: a.roomId,
              userId: a.userId ?? null,
              participantIdentity: a.participantIdentity ?? null,
            });
          }
          await insertSchedulingEvent(tx, {
            orgId: session.orgId,
            teacherId: session.teacherId,
            actorId: ctx.userId,
            type: "session.changed",
            aggregateType: "session",
            aggregateId: session.id,
          });
        });
        return NextResponse.json({ success: true, assigned: parsed.assignments.length });
      }

      throw new BusinessRuleError(`Unknown action '${action}'. Expected create, open, close, assign, or move-token.`);
    } catch (error) {
      return handleApiError(error);
    }
  });
}
