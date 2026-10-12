/**
 * @fileoverview The realtime sidecar: a plain Node HTTP server that owns the
 * scheduling WebSocket, because a Next route handler cannot answer 101.
 *
 *   GET  /api/realtime/ws?ticket=…  WebSocket upgrade into the org's hub
 *   POST /publish                   service-authed fan-out, called by the app
 *   GET  /healthz                   liveness
 *
 * It also runs the outbox retry sweep: every minute it POSTs the app's
 * service-authed drain route, which retries unpublished rows (attempts < 5)
 * and dead-letters the rest. Per-request afterResponse drains cover the happy
 * path; this is what keeps a failed publish from waiting for the next
 * unrelated mutation.
 *
 * Hubs live in this process's memory, so exactly one instance may run.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { isServiceAuthorized, verifyRealtimeTicket } from "@/lib/realtime/ticket";
import type { RealtimeClaims, SchedulingEventMessage } from "../protocol";
import { HubRegistry, toHubSocket } from "./node-hub";

const WS_PATH = "/api/realtime/ws";
const MAX_PUBLISH_BYTES = 64 * 1024;
const MAX_MESSAGE_BYTES = 16 * 1024;
const PING_INTERVAL_MS = 30_000;
const DRAIN_TIMEOUT_MS = 30_000;

export interface RealtimeServerOptions {
  secret: string;
  port?: number;
  host?: string;
  /** Base URL of the Next app, for the outbox drain. */
  appUrl?: string;
  /** 0 disables the drain timer. */
  drainIntervalMs?: number;
}

export interface RealtimeServer {
  port: number;
  close(): Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, status: number, message?: string) {
  if (status === 204 || !message) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

/** Refuses an upgrade with a real HTTP response, before any WebSocket exists. */
function refuseUpgrade(socket: Duplex, status: number, statusText: string, message: string) {
  const body = JSON.stringify({ error: message });
  socket.end(
    `HTTP/1.1 ${status} ${statusText}\r\n` +
      "Content-Type: application/json\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "Connection: close\r\n\r\n" +
      body
  );
}

async function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function startRealtimeServer(options: RealtimeServerOptions): Promise<RealtimeServer> {
  const { secret } = options;
  // Fail closed: an empty secret would make `Bearer ` a valid credential.
  if (!secret) throw new Error("REALTIME_SECRET is not set.");

  const registry = new HubRegistry(secret);
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakSet<WebSocket>();

  async function handlePublish(req: IncomingMessage, res: ServerResponse) {
    const authHeader = req.headers.authorization ?? null;
    // Authenticate before reading the body, so an unauthenticated caller
    // cannot make the sidecar buffer or parse anything.
    if (!isServiceAuthorized(authHeader, secret)) {
      return sendText(res, 401, "Unauthorized");
    }
    const raw = await readBody(req, MAX_PUBLISH_BYTES);
    if (raw === null) return sendText(res, 413, "Payload Too Large");

    let event: SchedulingEventMessage | null = null;
    try {
      event = JSON.parse(raw) as SchedulingEventMessage;
    } catch {
      event = null;
    }
    if (!event || typeof event.orgId !== "string" || !event.orgId) {
      return sendText(res, 400, "Bad Request: invalid event schema");
    }

    // An org with nobody connected gets a hub for the length of this call:
    // the event is validated the same way and delivered to no one, which is
    // a successful publish.
    const result = registry.get(event.orgId).publish(authHeader, event);
    registry.reap(event.orgId);
    sendText(res, result.status, result.message);
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://realtime");

    if (req.method === "GET" && url.pathname === "/healthz") {
      return sendJson(res, 200, { status: "ok", ...registry.stats() });
    }
    if (req.method === "POST" && url.pathname === "/publish") {
      handlePublish(req, res).catch((err) => {
        console.error("[realtime] publish failed:", err);
        if (!res.headersSent) sendText(res, 500, "Internal Server Error");
        else res.end();
      });
      return;
    }
    if (url.pathname === WS_PATH) {
      return sendText(res, 426, "Expected a WebSocket upgrade.");
    }
    sendText(res, 404, "Not Found");
  });

  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    void (async () => {
      const url = new URL(req.url ?? "/", "http://realtime");
      if (url.pathname !== WS_PATH) {
        return refuseUpgrade(socket, 404, "Not Found", "Not found");
      }

      // Never trust raw claims. Verify the signed ticket before upgrading.
      const ticket =
        url.searchParams.get("ticket") ||
        req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
        req.headers["sec-websocket-protocol"]?.split(",")[0]?.trim();
      if (!ticket) {
        return refuseUpgrade(socket, 401, "Unauthorized", "Missing realtime ticket");
      }

      let claims: RealtimeClaims;
      try {
        claims = await verifyRealtimeTicket(ticket, secret);
      } catch {
        return refuseUpgrade(socket, 401, "Unauthorized", "Invalid or expired realtime ticket");
      }

      const orgId = claims.orgId;
      const hub = registry.get(orgId);
      const refused = hub.admit(claims);
      if (refused) {
        registry.reap(orgId);
        return refuseUpgrade(
          socket,
          refused.status,
          refused.status === 403 ? "Forbidden" : "Unauthorized",
          refused.message ?? "Unauthorized"
        );
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const hubSocket = toHubSocket(ws);
        alive.add(ws);
        ws.on("pong", () => alive.add(ws));
        ws.on("message", (data, isBinary) => {
          if (isBinary) return;
          hub
            .webSocketMessage(hubSocket, data.toString())
            .catch((err) => console.error("[realtime] message handling failed:", err));
        });
        ws.on("close", () => registry.remove(orgId, hubSocket));
        ws.on("error", () => ws.terminate());
        hub.accept(hubSocket, claims).catch((err) => {
          console.error("[realtime] accept failed:", err);
          ws.terminate();
        });
      });
    })().catch((err) => {
      console.error("[realtime] upgrade failed:", err);
      socket.destroy();
    });
  });

  // Protocol-level pings: they keep an idle socket alive through the proxies
  // in front of us (a backgrounded tab stops sending app heartbeats), and
  // they find the peers that vanished without a close frame.
  const pingTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, PING_INTERVAL_MS);
  pingTimer.unref();

  // Outbox retry sweep.
  const appUrl = (options.appUrl ?? "http://web:3000").replace(/\/+$/, "");
  const drainIntervalMs = options.drainIntervalMs ?? 60_000;
  let draining = false;
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      const res = await fetch(`${appUrl}/api/realtime/drain-outbox`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(DRAIN_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[realtime] outbox drain answered ${res.status}`);
        return;
      }
      const result = (await res.json().catch(() => null)) as
        | { failed?: number; deadLettered?: string[] }
        | null;
      if (result?.failed || result?.deadLettered?.length) {
        console.warn(
          `[realtime] outbox drain: ${result.failed ?? 0} failed, ${result.deadLettered?.length ?? 0} dead-lettered`
        );
      }
    } catch (err) {
      console.warn("[realtime] outbox drain error:", err instanceof Error ? err.message : err);
    } finally {
      draining = false;
    }
  }
  const drainTimer = drainIntervalMs > 0 ? setInterval(() => void drain(), drainIntervalMs) : null;
  drainTimer?.unref();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 8787, options.host ?? "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    port: (server.address() as AddressInfo).port,
    async close() {
      clearInterval(pingTimer);
      if (drainTimer) clearInterval(drainTimer);
      // 1001 Going Away: the client hook reconnects with backoff.
      registry.closeAll(1001, "Server shutting down");
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
