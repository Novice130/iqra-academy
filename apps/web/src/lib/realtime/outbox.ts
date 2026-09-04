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
  version?: number;
}

/**
 * Inserts a scheduling outbox event within a database transaction.
 *
 * Guarantees that business mutations (availability, time-off, bookings, sessions)
 * commit atomically with the outbox event before any delivery takes place.
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
      version: params.version ?? 1,
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
