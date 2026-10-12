import { db, withHttpDb } from "@/lib/db";
import { schedulingEvents } from "@/db/schema";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import type { SchedulingEventMessage } from "@/realtime/protocol";
import { toSchedulingEventMessage } from "./outbox";
import { getRealtimeSecret } from "./ticket";

type LocalHubListener = (event: SchedulingEventMessage) => void;
const localListenersByOrg = new Map<string, Set<LocalHubListener>>();

/**
 * Register a local subscriber for tests or dev environments without the
 * realtime sidecar. Production never registers one.
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

const PUBLISH_TIMEOUT_MS = 3_000;

/**
 * Where the realtime sidecar listens, or null when there is none to talk to.
 *
 * Production always has one, so it defaults to loopback there and a sidecar
 * that is down is a failed delivery. Outside production the sidecar is
 * opt-in via REALTIME_INTERNAL_URL: `next dev` and the test suite normally
 * run without it, and defaulting to loopback there would turn every
 * mutation into a refused connection and a spent retry attempt.
 */
function sidecarUrl(): string | null {
  const configured = process.env.REALTIME_INTERNAL_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? "http://127.0.0.1:8787" : null;
}

/**
 * Publishes an event to the org's AvailabilityHub in the realtime sidecar.
 * Falls back to local in-memory subscribers in development or test environments.
 *
 * Delivery contract: resolves ONLY when the event reached its destination
 * (sidecar publish 2xx/204, or at least one local subscriber invoked without
 * throwing). Rejects otherwise — a sidecar that is unreachable, slow, or
 * answering non-2xx — so drainOutbox can count attempts instead of marking
 * undelivered rows published. Browser/test-only callers that only need
 * best-effort fan-out should catch.
 */
export async function publishToHub(event: SchedulingEventMessage): Promise<void> {
  // 1. Local subscribers (tests and local dev). Checked first so a test that
  // registered one gets its event whatever the environment says about a
  // sidecar.
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

  // 2. The realtime sidecar
  const url = sidecarUrl();
  if (url) {
    const res = await fetch(`${url}/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getRealtimeSecret()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Realtime sidecar publish failed with status ${res.status}`);
    }
    return;
  }

  // No destination (Next dev or a test run with no sidecar and no
  // listeners): resolve best-effort. drainOutbox treats a resolve as
  // delivered, so a drain that resolves here parks the row as published —
  // but the alternative (throwing) would wedge every mutation behind an
  // attempts counter in exactly the environments where realtime is
  // decorative. Production never gets here: sidecarUrl() always resolves
  // there, and the durable retry path is the sidecar's own drain timer
  // hitting the service-authed drain route.
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
 * and leaves the row unpublished for the next drain (the sidecar's timer or
 * the next request's afterResponse sweep).
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
