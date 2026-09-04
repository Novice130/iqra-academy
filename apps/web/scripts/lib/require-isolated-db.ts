/**
 * Guard every local DB script and test fixture must pass before touching a
 * database.
 *
 * These scripts used to run against whatever `DATABASE_URL` was in `.env` —
 * which is the shared dev/prod Neon database. Several of them DELETE rows
 * (availability, sessions, bookings) for "test setup". One careless
 * `npx tsx scripts/test-all-features.ts` wiped real teacher availability.
 *
 * The rules now:
 *
 * 1. `ALLOW_LOCAL_DB_SCRIPTS=1` must be set explicitly in the environment.
 * 2. `DATABASE_URL` must parse and its host must NOT be a known shared
 *    endpoint (the ones currently committed to `.env` / in team use).
 * 3. Its host must be localhost OR explicitly allowlisted via
 *    `LOCAL_TEST_DB_HOSTS=host1,host2` (use this for an isolated Neon test
 *    branch — see docs/testing.md).
 *
 * The guard fails closed: any doubt means the script exits non-zero with an
 * explanation, and nothing is read or written.
 */

const KNOWN_SHARED_DB_HOSTS = [
  // Shared Neon endpoints present in apps/web/.env* at the time this guard
  // was introduced. Update when the shared database moves.
  "ep-nameless-glade-ajjmmwi7-pooler.c-3.us-east-2.aws.neon.tech",
  "ep-nameless-glade-ajjmmwi7.c-3.us-east-2.aws.neon.tech",
  "ep-sparkling-dew-ajk0onv9-pooler.c-3.us-east-2.aws.neon.tech",
  "ep-sparkling-dew-ajk0onv9.c-3.us-east-2.aws.neon.tech",
];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function fail(scriptName: string, reason: string, hint?: string): never {
  console.error(`\n[${scriptName}] refused to run: ${reason}`);
  if (hint) console.error(`  → ${hint}`);
  console.error("  → See docs/testing.md for how to set up an isolated test database.\n");
  process.exit(1);
}

export function requireIsolatedDb(scriptName: string): void {
  if (process.env.ALLOW_LOCAL_DB_SCRIPTS !== "1") {
    fail(
      scriptName,
      "ALLOW_LOCAL_DB_SCRIPTS=1 is not set.",
      "This script can delete or overwrite data. Set ALLOW_LOCAL_DB_SCRIPTS=1 " +
        "and point DATABASE_URL at an isolated test database before running it.",
    );
  }

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    fail(scriptName, "DATABASE_URL is not set.", "Export DATABASE_URL for your isolated test database.");
  }

  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    fail(scriptName, "DATABASE_URL could not be parsed as a URL.");
  }

  if (KNOWN_SHARED_DB_HOSTS.includes(host)) {
    fail(
      scriptName,
      `DATABASE_URL points at a known shared database host (${host}).`,
      "Create an isolated Neon branch (or a local Postgres) for tests and use its connection string instead.",
    );
  }

  const allowlist = (process.env.LOCAL_TEST_DB_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (!LOCAL_HOSTS.has(host) && !allowlist.includes(host)) {
    fail(
      scriptName,
      `DATABASE_URL host "${host}" is not localhost and not in LOCAL_TEST_DB_HOSTS.`,
      `If ${host} is your dedicated test database, run with LOCAL_TEST_DB_HOSTS=${host}.`,
    );
  }
}
