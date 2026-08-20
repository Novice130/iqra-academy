/**
 * @fileoverview Work that should happen because of a request, but that the
 * caller must not wait for.
 *
 * Some of what a route does is not part of its answer. Ringing a class, or
 * seeding a room's spotlight metadata, has to happen when a teacher joins —
 * but the teacher's browser needs the LiveKit token, not the outcome of a
 * push notification. Awaiting those inside the handler put several network
 * round trips between tapping Join and seeing video.
 *
 * The catch is that a plain floating promise is NOT safe on Cloudflare
 * Workers: once a handler returns its response, the runtime is free to cancel
 * anything still pending in that request's context. Fire-and-forget there
 * means the ring silently stops going out — worse than the delay it saves.
 * `waitUntil` is the runtime's own answer: it keeps the isolate alive until
 * the promise settles, without holding up the response.
 *
 * Outside a Worker (`next dev`, `next start`, scripts) there is no execution
 * context to hand the promise to, so it simply runs to completion in-process,
 * which is what those environments do anyway.
 *
 * @module lib/after-response
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Runs `work` without blocking the response, keeping it alive on Workers.
 *
 * Rejections are swallowed deliberately: every current caller is best-effort
 * bookkeeping, and an unhandled rejection in a deferred task must never be
 * the reason a request that already succeeded gets reported as failed.
 */
export function afterResponse(work: Promise<unknown>): void {
  const swallowed = Promise.resolve(work).catch(() => {});

  try {
    // Synchronous form: inside a Worker request this resolves immediately.
    // It throws outside one, which is exactly the local-dev case below.
    const cf = getCloudflareContext();
    if (cf?.ctx?.waitUntil) {
      cf.ctx.waitUntil(swallowed);
      return;
    }
    console.warn("[afterResponse] Cloudflare context has no waitUntil");
  } catch {
    // Not running on Workers, or no context for this call. Fall through.
  }

  // Nothing to register with. The promise is already running and its
  // rejection is already handled; letting it finish on its own is correct
  // everywhere that isn't a Worker.
}
