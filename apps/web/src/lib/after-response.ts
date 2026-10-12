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
 * The catch is that a plain floating promise is not something the framework
 * knows about: nothing ties it to the request that started it, and a graceful
 * shutdown (every deploy restarts the container) is free to exit with it still
 * pending. Next's `after()` is the framework's own answer — it registers the
 * work against the request, lets the response go out first, and is awaited
 * before the server closes.
 *
 * Outside a request (`tsx` scripts, tests, a module evaluated at build) there
 * is no request scope and `after()` throws. The promise is already running by
 * then, so it simply runs to completion in-process, which is what those
 * environments do anyway.
 *
 * @module lib/after-response
 */

import { after } from "next/server";

/**
 * Runs `work` without blocking the response, registered with the request so
 * it outlives the handler.
 *
 * Rejections are swallowed deliberately: every current caller is best-effort
 * bookkeeping, and an unhandled rejection in a deferred task must never be
 * the reason a request that already succeeded gets reported as failed.
 */
export function afterResponse(work: Promise<unknown>): void {
  const swallowed = Promise.resolve(work).catch(() => {});

  try {
    // Throws when there is no request scope, which is exactly the
    // script/test case below.
    after(swallowed);
  } catch {
    // Nothing to register with. The promise is already running and its
    // rejection is already handled; letting it finish on its own is correct.
  }
}
