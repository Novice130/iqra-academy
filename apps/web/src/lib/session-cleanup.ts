/**
 * @fileoverview Deleting a session and everything that points at it.
 *
 * WHY THIS EXISTS: two routes delete sessions (single delete and the bulk
 * "clear instant meetings"), and both had hand-rolled, *incomplete* lists of
 * dependent rows. Neither removed `call_invites` or `notifications`, both of
 * which carry a foreign key to `sessions`. So any meeting that had ever rung
 * a student or fired a "class started" notification failed on the FK, rolled
 * the whole transaction back, and the teacher just saw "Failed to clean up
 * meetings" with nothing deleted.
 *
 * One list, used by both, so a new table with a session FK only has to be
 * added here. Order matters: children before parents.
 */

import { eq } from "drizzle-orm";
import {
  bookings,
  callInvites,
  chatMessages,
  chatModerationActions,
  chatRooms,
  guestJoinRequests,
  notifications,
  progressRecords,
  sessionAttendance,
  sessionAttendees,
  sessions,
  teacherFeedback,
} from "@/db/schema";

/** Anything with a transaction-shaped `delete`/`query` — the Drizzle tx. */
type Tx = {
  delete: (table: never) => { where: (cond: unknown) => Promise<unknown> };
  query: {
    chatRooms: { findMany: (args: unknown) => Promise<{ id: string }[]> };
    chatMessages: { findMany: (args: unknown) => Promise<{ id: string }[]> };
  };
};

export async function deleteSessionCascade(tx: Tx, sessionId: string) {
  const t = tx as unknown as {
    delete: (table: unknown) => { where: (cond: unknown) => Promise<unknown> };
    query: Tx["query"];
  };

  // Chat: moderation actions -> messages -> rooms
  const rooms = await tx.query.chatRooms.findMany({
    where: eq(chatRooms.sessionId, sessionId),
    columns: { id: true },
  });
  for (const room of rooms) {
    const messages = await tx.query.chatMessages.findMany({
      where: eq(chatMessages.roomId, room.id),
      columns: { id: true },
    });
    for (const message of messages) {
      await t.delete(chatModerationActions).where(eq(chatModerationActions.messageId, message.id));
    }
    await t.delete(chatMessages).where(eq(chatMessages.roomId, room.id));
  }
  await t.delete(chatRooms).where(eq(chatRooms.sessionId, sessionId));

  // The two that were missing, and the reason deletes were failing.
  await t.delete(callInvites).where(eq(callInvites.sessionId, sessionId));
  await t.delete(notifications).where(eq(notifications.sessionId, sessionId));
  await t.delete(guestJoinRequests).where(eq(guestJoinRequests.sessionId, sessionId));

  await t.delete(progressRecords).where(eq(progressRecords.sessionId, sessionId));
  await t.delete(teacherFeedback).where(eq(teacherFeedback.sessionId, sessionId));
  await t.delete(sessionAttendees).where(eq(sessionAttendees.sessionId, sessionId));
  await t.delete(sessionAttendance).where(eq(sessionAttendance.sessionId, sessionId));
  await t.delete(bookings).where(eq(bookings.sessionId, sessionId));
  await t.delete(sessions).where(eq(sessions.id, sessionId));
}
