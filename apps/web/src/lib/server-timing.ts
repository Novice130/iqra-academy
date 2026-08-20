/**
 * @fileoverview `Server-Timing` headers — where a slow request actually went.
 *
 * Timing a route from outside tells you almost nothing useful: a request
 * measured from a laptop is mostly that laptop's trip to the edge, and no
 * amount of curl separates "the database was slow" from "the user is far from
 * Cloudflare". `Server-Timing` is measured inside the handler and read by the
 * browser, so a real join, from a real teacher, on a real connection, reports
 * its own breakdown — and it shows up in DevTools' Network panel per request
 * with no extra tooling.
 *
 * Names are kept short because they go on the wire on every response.
 *
 * @module lib/server-timing
 */

/** One phase's label and duration, in the order they were recorded. */
type Mark = { name: string; ms: number };

export interface Timings {
  /** Times `work`, records it under `name`, and passes its result through. */
  track<T>(name: string, work: Promise<T>): Promise<T>;
  /** Records a phase measured by hand, for code that isn't a single promise. */
  add(name: string, ms: number): void;
  /** The header value, including a `total` covering everything so far. */
  header(): string;
}

/**
 * Starts a timing set for one request.
 *
 * `total` is deliberately wall-clock from creation rather than the sum of the
 * marks: work that runs in parallel would otherwise add up to more than the
 * request took, and the gap between `total` and the marks is itself the
 * interesting part — it's the time nothing accounted for.
 */
export function createTimings(): Timings {
  const startedAt = Date.now();
  const marks: Mark[] = [];

  return {
    async track<T>(name: string, work: Promise<T>): Promise<T> {
      const from = Date.now();
      try {
        return await work;
      } finally {
        marks.push({ name, ms: Date.now() - from });
      }
    },

    add(name: string, ms: number) {
      marks.push({ name, ms });
    },

    header() {
      return [...marks, { name: "total", ms: Date.now() - startedAt }]
        .map(({ name, ms }) => `${name};dur=${ms}`)
        .join(", ");
    },
  };
}

/**
 * Attaches the header to a response on its way out.
 *
 * Returns the same response so it can wrap a `return` directly. Timings are
 * diagnostics: if anything here fails, the response still goes.
 */
export function withTimings<T extends Response>(response: T, timings: Timings): T {
  try {
    response.headers.set("Server-Timing", timings.header());
  } catch {
    // Immutable headers on some response types. Not worth failing a join over.
  }
  return response;
}
