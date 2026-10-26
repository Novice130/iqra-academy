/**
 * @fileoverview Read-side helpers for the admin ops screens: /admin/system
 * (health) and /admin/audit (the audit log viewer), plus the room-to-org
 * lookup that /api/admin/livekit-rooms uses to keep an ORG_ADMIN inside
 * their own org.
 *
 * Every probe here reports what it actually saw. A probe that fails returns
 * `{ ok: false, error }` instead of throwing, so one dead dependency shows up
 * as one red panel rather than a blank page, and nothing is ever reported
 * healthy because the check was skipped.
 *
 * Server only: it talks to the database, LiveKit and the realtime sidecar.
 *
 * @module lib/admin-ops
 */

import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, max, min, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  breakoutRooms,
  breakoutSets,
  crmSyncEvents,
  deviceTokens,
  guestJoinRequests,
  pushSubscriptions,
  schedulingEvents,
  sessions,
  studentProfiles,
  users,
} from "@/db/schema";
import { getRoomServiceClient, sessionIdFromRoomName } from "@/lib/livekit";
import { OUTBOX_MAX_ATTEMPTS, sidecarUrl } from "@/lib/realtime/outbox-publisher";

// ─── Shared shapes ──────────────────────────────────────────────────────────

/** Who is asking. Both AdminContext (pages) and AuthContext (routes) fit. */
export interface OpsScope {
  orgId: string;
  role: string;
}

const isSuper = (scope: OpsScope) => scope.role === "SUPER_ADMIN";

/** `column = orgId` for an ORG_ADMIN, nothing for a SUPER_ADMIN. */
function scoped(scope: OpsScope, column: PgColumn): SQL | undefined {
  return isSuper(scope) ? undefined : eq(column, scope.orgId);
}

export type Probe<T> =
  | { ok: true; checkedAt: string; data: T }
  | { ok: false; checkedAt: string; error: string };

/** Run one check, timestamp it, and turn any throw into a reported failure. */
async function probe<T>(fn: () => Promise<T>): Promise<Probe<T>> {
  try {
    const data = await fn();
    return { ok: true, checkedAt: new Date().toISOString(), data };
  } catch (err) {
    return { ok: false, checkedAt: new Date().toISOString(), error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Driver and HTTP errors can be long; the panel needs the gist, not a dump.
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg;
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not answer within ${ms / 1000}s`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ─── LiveKit rooms ──────────────────────────────────────────────────────────

export interface RoomSession {
  sessionId: string;
  orgId: string;
  title: string | null;
  status: string;
  /** True when the room is a breakout of this session rather than its main room. */
  breakout: boolean;
}

/**
 * Which session each LiveKit room belongs to, in two queries for the whole list.
 *
 * Main rooms are found by id (`qlms-<id>`, see generateRoomName) or by the
 * stored `videoRoomName`, which instant meetings and merges can set to a name
 * of their own. Breakout rooms are found through breakout_rooms, whose name
 * is not the session id at all. A room absent from the map has no session.
 */
export async function resolveRoomSessions(roomNames: string[]): Promise<Map<string, RoomSession>> {
  const out = new Map<string, RoomSession>();
  if (roomNames.length === 0) return out;
  const ids = roomNames.map(sessionIdFromRoomName).filter((v): v is string => !!v);

  const sessionCols = {
    id: sessions.id,
    orgId: sessions.orgId,
    title: sessions.title,
    status: sessions.status,
    videoRoomName: sessions.videoRoomName,
  };
  const [main, breakouts] = await Promise.all([
    db
      .select(sessionCols)
      .from(sessions)
      .where(ids.length ? or(inArray(sessions.id, ids), inArray(sessions.videoRoomName, roomNames)) : inArray(sessions.videoRoomName, roomNames)),
    db
      .select({ ...sessionCols, roomName: breakoutRooms.videoRoomName })
      .from(breakoutRooms)
      .innerJoin(breakoutSets, eq(breakoutSets.id, breakoutRooms.breakoutSetId))
      .innerJoin(sessions, eq(sessions.id, breakoutSets.sessionId))
      .where(inArray(breakoutRooms.videoRoomName, roomNames)),
  ]);

  const byId = new Map(main.map((s) => [s.id, s]));
  const byRoom = new Map(main.filter((s) => s.videoRoomName).map((s) => [s.videoRoomName!, s]));
  for (const name of roomNames) {
    const fromId = sessionIdFromRoomName(name);
    const s = byRoom.get(name) ?? (fromId ? byId.get(fromId) : undefined);
    if (s) out.set(name, { sessionId: s.id, orgId: s.orgId, title: s.title, status: s.status, breakout: false });
  }
  for (const b of breakouts) {
    if (b.roomName && !out.has(b.roomName)) {
      out.set(b.roomName, { sessionId: b.id, orgId: b.orgId, title: b.title, status: b.status, breakout: true });
    }
  }
  return out;
}

/**
 * Whether this admin may see or end a room. An ORG_ADMIN only gets rooms
 * whose session is in their org; a room with no session at all belongs to
 * nobody's org, so only a SUPER_ADMIN sees it.
 */
export function roomVisibleTo(scope: OpsScope, match: RoomSession | undefined): boolean {
  if (isSuper(scope)) return true;
  return !!match && match.orgId === scope.orgId;
}

export interface LiveRoom {
  name: string;
  participants: number;
  createdAt: string | null;
  session: RoomSession | null;
  /** No session, or the session is not IN_PROGRESS — LiveKit is billing for a class that isn't running. */
  orphan: boolean;
}

/** Every open LiveKit room this admin may see, matched to its session. */
export async function listLiveRooms(scope: OpsScope): Promise<LiveRoom[]> {
  const rooms = await withTimeout(getRoomServiceClient().listRooms(), 5000, "LiveKit");
  const matches = await resolveRoomSessions(rooms.map((r) => r.name));
  return rooms
    .filter((r) => roomVisibleTo(scope, matches.get(r.name)))
    .map((r) => {
      const session = matches.get(r.name) ?? null;
      return {
        name: r.name,
        participants: r.numParticipants,
        createdAt: r.creationTime ? new Date(Number(r.creationTime) * 1000).toISOString() : null,
        session,
        orphan: !session || session.status !== "IN_PROGRESS",
      };
    })
    .sort((a, b) => Number(b.orphan) - Number(a.orphan) || a.name.localeCompare(b.name));
}

// ─── Health probes ──────────────────────────────────────────────────────────

/** A trivial round trip, timed. */
export function probeDatabase(): Promise<Probe<{ latencyMs: number }>> {
  return probe(async () => {
    const started = performance.now();
    await db.execute(sql`select 1`);
    return { latencyMs: Math.round(performance.now() - started) };
  });
}

export function probeLiveKit(scope: OpsScope): Promise<Probe<LiveRoom[]>> {
  return probe(() => listLiveRooms(scope));
}

/** How long after its scheduled end an IN_PROGRESS class counts as stuck. */
export const STALE_AFTER_MIN = 30;

export interface StaleSession {
  id: string;
  title: string | null;
  scheduledEnd: string;
  teacherName: string | null;
}

/**
 * Classes still IN_PROGRESS well after they should have ended. `scheduledEnd`
 * already includes extensions (the extend route moves it), so it is the
 * honest end time. Usually a room_finished webhook that never arrived.
 */
export function probeStaleSessions(scope: OpsScope): Promise<Probe<StaleSession[]>> {
  return probe(async () => {
    const cutoff = new Date(Date.now() - STALE_AFTER_MIN * 60_000);
    const rows = await db
      .select({ id: sessions.id, title: sessions.title, scheduledEnd: sessions.scheduledEnd, teacherName: users.name })
      .from(sessions)
      .leftJoin(users, eq(users.id, sessions.teacherId))
      .where(and(eq(sessions.status, "IN_PROGRESS"), lt(sessions.scheduledEnd, cutoff), scoped(scope, sessions.orgId)))
      .orderBy(asc(sessions.scheduledEnd))
      .limit(50);
    return rows.map((r) => ({ ...r, scheduledEnd: r.scheduledEnd.toISOString() }));
  });
}


export interface OutboxStats {
  pending: number;
  oldestPendingAt: string | null;
  deadLettered: number;
  lastPublishedAt: string | null;
}

export function probeOutbox(scope: OpsScope): Promise<Probe<OutboxStats>> {
  return probe(async () => {
    const org = scoped(scope, schedulingEvents.orgId);
    const unpublished = isNull(schedulingEvents.publishedAt);
    const [[pending], [dead], [last]] = await Promise.all([
      db
        .select({ n: count(), oldest: min(schedulingEvents.createdAt) })
        .from(schedulingEvents)
        .where(and(unpublished, lt(schedulingEvents.attempts, OUTBOX_MAX_ATTEMPTS), org)),
      db
        .select({ n: count() })
        .from(schedulingEvents)
        .where(and(unpublished, gte(schedulingEvents.attempts, OUTBOX_MAX_ATTEMPTS), org)),
      db
        .select({ at: max(schedulingEvents.publishedAt) })
        .from(schedulingEvents)
        .where(and(isNotNull(schedulingEvents.publishedAt), org)),
    ]);
    return {
      pending: pending.n,
      oldestPendingAt: pending.oldest ? new Date(pending.oldest).toISOString() : null,
      deadLettered: dead.n,
      lastPublishedAt: last.at ? new Date(last.at).toISOString() : null,
    };
  });
}

export interface CrmStats {
  failures7d: number;
  latestError: { message: string | null; at: string } | null;
}

export function probeCrm(scope: OpsScope): Promise<Probe<CrmStats>> {
  return probe(async () => {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const failed = and(eq(crmSyncEvents.success, false), scoped(scope, crmSyncEvents.orgId));
    const [[agg], latest] = await Promise.all([
      db.select({ n: count() }).from(crmSyncEvents).where(and(failed, gte(crmSyncEvents.createdAt, since))),
      db
        .select({ message: crmSyncEvents.errorMessage, at: crmSyncEvents.createdAt })
        .from(crmSyncEvents)
        .where(failed)
        .orderBy(desc(crmSyncEvents.createdAt))
        .limit(1),
    ]);
    return {
      failures7d: agg.n,
      latestError: latest[0] ? { message: latest[0].message, at: latest[0].at.toISOString() } : null,
    };
  });
}

export interface DeliveryCounts {
  guestRequestsPending: number;
  pushSubscriptions: number;
  deviceTokens: number;
}

/** Push and device rows carry no org of their own; their owner's row does. */
export function probeDeliveryCounts(scope: OpsScope): Promise<Probe<DeliveryCounts>> {
  return probe(async () => {
    const [[guests], [push], [devices]] = await Promise.all([
      db
        .select({ n: count() })
        .from(guestJoinRequests)
        .where(and(eq(guestJoinRequests.status, "PENDING"), scoped(scope, guestJoinRequests.orgId))),
      isSuper(scope)
        ? db.select({ n: count() }).from(pushSubscriptions)
        : db.select({ n: count() }).from(pushSubscriptions).innerJoin(users, eq(users.id, pushSubscriptions.userId)).where(eq(users.orgId, scope.orgId)),
      isSuper(scope)
        ? db.select({ n: count() }).from(deviceTokens)
        : db.select({ n: count() }).from(deviceTokens).innerJoin(users, eq(users.id, deviceTokens.userId)).where(eq(users.orgId, scope.orgId)),
    ]);
    return { guestRequestsPending: guests.n, pushSubscriptions: push.n, deviceTokens: devices.n };
  });
}

/**
 * The sidecar URL the app itself publishes to. Null means this deployment
 * has no sidecar to talk to, and the panel is left out rather than faked.
 */
function realtimeSidecarUrl(): { url: string; source: "REALTIME_INTERNAL_URL" | "production default" } | null {
  const url = sidecarUrl();
  if (!url) return null;
  return { url, source: process.env.REALTIME_INTERNAL_URL ? "REALTIME_INTERNAL_URL" : "production default" };
}

export interface SidecarHealth {
  source: string;
  latencyMs: number;
  hubs: number | null;
  sockets: number | null;
}

export async function probeSidecar(): Promise<Probe<SidecarHealth> | null> {
  const target = realtimeSidecarUrl();
  if (!target) return null;
  return probe(async () => {
    const started = performance.now();
    const res = await fetch(`${target.url}/healthz`, { signal: AbortSignal.timeout(2000), cache: "no-store" });
    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) throw new Error(`Health check answered HTTP ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as { hubs?: unknown; sockets?: unknown };
    return {
      source: target.source,
      latencyMs,
      hubs: typeof body.hubs === "number" ? body.hubs : null,
      sockets: typeof body.sockets === "number" ? body.sockets : null,
    };
  });
}

// ─── Audit log targets ──────────────────────────────────────────────────────

export interface TargetLink {
  href: string;
  label: string;
}

/**
 * Audit targets are written as "entity:id" (see AuditLogParams.target), but
 * older rows and a few routes write other shapes. Rather than trust the
 * prefix, every candidate id is looked up in sessions, student profiles and
 * users in one batch, and only a row that exists in this admin's scope gets
 * a link. The prefix only breaks a tie when one id somehow matches twice.
 */
export async function resolveAuditTargets(scope: OpsScope, targets: (string | null)[]): Promise<Map<string, TargetLink>> {
  const parsed = new Map<string, { kind: string | null; id: string }>();
  for (const t of targets) {
    if (!t || parsed.has(t)) continue;
    const i = t.indexOf(":");
    parsed.set(t, i > 0 ? { kind: t.slice(0, i), id: t.slice(i + 1) } : { kind: null, id: t });
  }
  const ids = [...new Set([...parsed.values()].map((p) => p.id).filter(Boolean))];
  const out = new Map<string, TargetLink>();
  if (ids.length === 0) return out;

  const [sessionRows, profileRows, userRows] = await Promise.all([
    db.select({ id: sessions.id, title: sessions.title }).from(sessions).where(and(inArray(sessions.id, ids), scoped(scope, sessions.orgId))),
    db.select({ id: studentProfiles.id, name: studentProfiles.name }).from(studentProfiles).where(and(inArray(studentProfiles.id, ids), scoped(scope, studentProfiles.orgId))),
    db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(inArray(users.id, ids), scoped(scope, users.orgId))),
  ]);
  const found = {
    session: new Map(sessionRows.map((r) => [r.id, { href: `/admin/sessions/${r.id}`, label: r.title || "Class" }])),
    profile: new Map(profileRows.map((r) => [r.id, { href: `/admin/students/${r.id}`, label: r.name }])),
    user: new Map(
      userRows.map((r) => [r.id, { href: r.role === "TEACHER" ? `/admin/teachers/${r.id}` : "/admin/users", label: r.name }])
    ),
  };
  for (const [raw, { kind, id }] of parsed) {
    const preferred = kind && kind in found ? found[kind as keyof typeof found].get(id) : undefined;
    const link = preferred ?? found.session.get(id) ?? found.profile.get(id) ?? found.user.get(id);
    if (link) out.set(raw, link);
  }
  return out;
}
