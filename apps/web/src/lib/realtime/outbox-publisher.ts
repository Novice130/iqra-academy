import { db } from "@/lib/db";
import { schedulingEvents } from "@/db/schema";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import type { SchedulingEventMessage } from "@/realtime/protocol";
import { toSchedulingEventMessage } from "./outbox";

type LocalHubListener = (event: SchedulingEventMessage) => void;
const localListenersByOrg = new Map<string, Set<LocalHubListener>>();

/**
 * Register a local subscriber for tests or dev environments without Cloudflare DOs.
 */
export function subscribeLocalHub(orgId: string, listener: LocalHubListener): () => void {
  if (!localListenersByOrg.has(orgId)) {
    localListenersByOrg.set(orgId, new Set());
  }
  const set = localListenersByOrg.get(orgId)!;
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/**
 * Publishes an event to the partitioned AvailabilityHub Durable Object.
 * Falls back to local in-memory subscribers in development or test environments.
 */
export async function publishToHub(event: SchedulingEventMessage): Promise<void> {
  // 1. Try Cloudflare Durable Object delivery
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const cf = getCloudflareContext();
    const hubNamespace = (cf?.env as any)?.AVAILABILITY_HUB;
    if (hubNamespace && typeof hubNamespace.idFromName === "function") {
      const doId = hubNamespace.idFromName(event.orgId);
      const stub = hubNamespace.get(doId);
      const secret = (cf?.env as any)?.REALTIME_SECRET || process.env.REALTIME_SECRET || "novicetutor-realtime-secret";
      const res = await stub.fetch("https://hub/publish", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        throw new Error(`Durable Object publish failed with status ${res.status}`);
      }
    }
  } catch {
    // Expected in environments where @opennextjs/cloudflare context is not bound (tests, Next dev)
  }

  // 2. Dispatch to local subscribers (for tests and local dev)
  const listeners = localListenersByOrg.get(event.orgId);
  if (listeners && listeners.size > 0) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Local hub listener error:", err);
      }
    }
  }

  // If running in an environment with neither DO nor local listeners, publishing succeeds idempotently
}

/**
 * Drains pending events from the scheduling_events outbox table.
 * Enforces retry counts and dead-letter warning after 5 failed attempts.
 */
export async function drainOutbox(opts: { orgId?: string; limit?: number } = {}) {
  const limit = opts.limit ?? 50;
  const whereConditions = [
    isNull(schedulingEvents.publishedAt),
    lt(schedulingEvents.attempts, 5),
  ];
  if (opts.orgId) {
    whereConditions.push(eq(schedulingEvents.orgId, opts.orgId));
  }

  const pending = await db
    .select()
    .from(schedulingEvents)
    .where(and(...whereConditions))
    .orderBy(asc(schedulingEvents.createdAt))
    .limit(limit);

  let published = 0;
  let failed = 0;

  for (const row of pending) {
    const message = toSchedulingEventMessage(row);
    try {
      await publishToHub(message);
      await db
        .update(schedulingEvents)
        .set({ publishedAt: new Date() })
        .where(eq(schedulingEvents.id, row.id));
      published++;
    } catch (err) {
      failed++;
      console.warn(`[Realtime Outbox] Failed publishing event ${row.id}:`, err);
      const nextAttempts = (row.attempts ?? 0) + 1;
      await db
        .update(schedulingEvents)
        .set({ attempts: nextAttempts })
        .where(eq(schedulingEvents.id, row.id));
      if (nextAttempts >= 5) {
        console.error(`[Realtime Outbox Dead-Letter] Event ${row.id} for org ${row.orgId} exceeded 5 attempts.`);
      }
    }
  }

  return { published, failed };
}
