/**
 * @fileoverview Entry point of the realtime sidecar process.
 *
 * Bundled to dist/realtime-server.mjs by scripts/build-realtime.mjs and run
 * with plain `node`. Configuration is environment only:
 *
 *   REALTIME_SECRET    required — shared with the app; the process refuses
 *                      to start without it
 *   REALTIME_PORT      listen port, default 8787
 *   APP_INTERNAL_URL   the Next app, for the outbox drain; default
 *                      http://web:3000
 *   REALTIME_DRAIN_INTERVAL_MS
 *                      how often to sweep the outbox for failed publishes;
 *                      default 60000, 0 turns the sweep off. Each sweep
 *                      queries the database, so a short interval keeps a
 *                      scale-to-zero database (Neon free plan) awake.
 */

import { startRealtimeServer } from "./server";

async function main() {
  const secret = process.env.REALTIME_SECRET;
  if (!secret) {
    console.error("[realtime] REALTIME_SECRET is not set — refusing to start.");
    process.exit(1);
  }

  const port = Number(process.env.REALTIME_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`[realtime] Invalid REALTIME_PORT: ${process.env.REALTIME_PORT}`);
    process.exit(1);
  }

  const drainIntervalMs = Number(process.env.REALTIME_DRAIN_INTERVAL_MS ?? 60_000);
  if (!Number.isInteger(drainIntervalMs) || drainIntervalMs < 0) {
    console.error(
      `[realtime] Invalid REALTIME_DRAIN_INTERVAL_MS: ${process.env.REALTIME_DRAIN_INTERVAL_MS}`,
    );
    process.exit(1);
  }

  const server = await startRealtimeServer({
    secret,
    port,
    appUrl: process.env.APP_INTERNAL_URL || undefined,
    drainIntervalMs,
  });
  console.log(`[realtime] listening on 0.0.0.0:${server.port}`);

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[realtime] ${signal} received, shutting down`);
    server
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error("[realtime] shutdown failed:", err);
        process.exit(1);
      });
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

main().catch((err) => {
  console.error("[realtime] failed to start:", err);
  process.exit(1);
});
