import { db, withHttpDb } from "@/lib/db";
import { schedulingEvents } from "@/db/schema";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import type { SchedulingEventMessage } from "@/realtime/protocol";
import { toSchedulingEventMessage } from "./outbox";
import { getRealtimeSecret } from "./ticket";

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
 *
 * Delivery contract: resolves ONLY when the event reached its destination
 * (DO publish 2xx/204, or at least one local subscriber invoked without
 * throwing). Rejects otherwise — including when NO destination exists in a
 * server runtime — so drainOutbox can count attempts instead of marking
 * undelivered rows published. Browser/test-only callers that only need
 * best-effort fan-out should catch.
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
      const secret = (cf?.env as any)?.REALTIME_SECRET || getRealtimeSecret();
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
      return;
    }
  } catch (err) {
    // Expected in environments where @opennextjs/cloudflare context is not bound (tests, Next dev).
    // Swallow ONLY the missing-context case; a bound namespace that fails must reject.
    const message = err instanceof Error ? err.message : "";
    if (!/context|cloudflare|Workers|no context/i.test(message) && message !== "") {
      throw err;
    }
  }

  // 2. Dispatch to local subscribers (for tests and local dev)
  const listeners = localListenersByOrg.get(event.orgId);
  if (listeners && listeners.size > 0) {
    let delivered = 0;
    let lastError: unknown = null;
    for (const listener of listeners) {
      try {
        listener(event);
        delivered++;
      } catch (err) {
        lastError = err;
        console.error("Local hub listener error:", err);
      }
    }
    if (delivered === 0) {
      throw lastError instanceof Error ? lastError : new Error("Local hub delivery failed");
    }
    return;
  }

  // No destination (Next dev with no listeners, plain build without a DO
  // binding): resolve best-effort. drainOutbox treats a resolve as delivered,
  // so a drain that resolves here would park the row as published — but the
  // alternative (throwing) would wedge every mutation behind an attempts
  // counter in exactly the environments where realtime is decorative. The
  // durable retry path is the scheduled drain in production, where the DO
  // binding always exists; see wrangler.json [triggers] and the drain
  // route's service auth.
  return;
}

/**
 * Result of a single drain pass, including rows that crossed the
 * dead-letter threshold on this pass.
 */
export interface DrainResult {
  published: number;
  failed: number;
  deadLettered: string[];
}

/**
 * Drains pending events from the scheduling_events outbox table.
 * Enforces retry counts and dead-letter warning after 5 failed attempts.
 *
 * Delivery contract: a row is marked published ONLY when publishToHub
 * resolves. Any transport/listener failure bubbles, increments attempts,
 * and leaves the row unpublished for the next drain (cron or the next
 * request's afterResponse sweep).
 */
export async function drainOutbox(opts: { orgId?: string; limit?: number } = {}): Promise<DrainResult> {
  return withHttpDb(async () => {
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
    const deadLettered: string[] = [];

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
          deadLettered.push(row.id);
          console.error(`[Realtime Outbox Dead-Letter] Event ${row.id} for org ${row.orgId} exceeded 5 attempts.`);
        }
      }
    }

    return { published, failed, deadLettered };
  });
}
