import { createId } from "@paralleldrive/cuid2";
import { schedulingEvents } from "@/db/schema";
import type { SchedulingEventType, SchedulingEventMessage } from "@/realtime/protocol";

export interface OutboxEventParams {
  orgId: string;
  teacherId: string;
  actorId: string;
  type: SchedulingEventType;
  aggregateType: string;
  aggregateId?: string | null;
}

/**
 * Inserts a scheduling outbox event within a database transaction.
 *
 * Guarantees that business mutations (availability, time-off, bookings, sessions)
 * commit atomically with the outbox event before any delivery takes place.
 *
 * Versioning is deliberately eventId-scoped, not per-aggregate: the hook
 * deduplicates by eventId and treats a redelivered row as the same event.
 * `version` stays in the protocol (always 1) for forward compatibility —
 * see AI2 Phase 4 review for the waiver. Do not invent per-aggregate
 * sequence numbers here: without an atomic counter per aggregate they would
 * be racy and worse than useless.
 */
export async function insertSchedulingEvent(
  tx: any,
  params: OutboxEventParams
) {
  const id = createId();
  const [row] = await tx
    .insert(schedulingEvents)
    .values({
      id,
      orgId: params.orgId,
      teacherId: params.teacherId,
      actorId: params.actorId,
      type: params.type,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId ?? null,
      version: 1,
    })
    .returning();

  return row;
}

/**
 * Converts a database scheduling_events row into the canonical SchedulingEventMessage.
 */
export function toSchedulingEventMessage(row: {
  id: string;
  orgId: string;
  teacherId: string | null;
  actorId: string | null;
  type: string;
  aggregateId: string | null;
  createdAt: Date;
  version: number;
}): SchedulingEventMessage {
  return {
    eventId: row.id,
    orgId: row.orgId,
    teacherId: row.teacherId ?? "",
    actorId: row.actorId ?? "",
    type: row.type as SchedulingEventType,
    aggregateId: row.aggregateId,
    committedAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    version: row.version ?? 1,
  };
}
