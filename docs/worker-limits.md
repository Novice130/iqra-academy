# Worker limits, and the outages that found them

Written 2026-08-08, after the site went down twice as classes started.

The Worker has **128 MB of memory** and 30s of CPU on the `standard` usage
model. The CPU has never been close. The memory has taken the site down twice,
and both times the cause was ordinary code doing something reasonable-looking
per request.

## What happened

| When (UTC) | Failed requests | Top path |
|---|---|---|
| 2026-08-05 23:00 | 15 | — |
| 2026-08-06 14:00–15:00 | 128 | `/api/sessions/[id]/guests` (66) |
| 2026-08-07 14:13–14:16 | 40 | `/api/sessions/[id]/guests` (40) |
| 2026-08-31 23:13 | ~15 | `/api/guest/join` |

Users saw Cloudflare **error 1102, "Worker exceeded resource limits"**. Both
bursts began minutes after a class started, lasted about four minutes, and
recovered on their own.

## Why

`src/lib/db.ts` opened **a new Neon WebSocket pool per request** — a TLS
handshake and a socket held for the life of that request. That buys interactive
transactions, and every request was paying for it whether it opened one or not.

Then count the polling. A dashboard sitting open, doing nothing:

| Component | Interval | req/min |
|---|---|---|
| `IncomingCallOverlay` | 2.5s | 24 |
| `LiveClassRibbon` | 15s | 4 |
| `MeetingNotificationBanner` | 20s | 3 |

~31 requests a minute per idle tab, each opening its own pool, before anyone
joins a class. On the call screen `GuestKnockPrompt` added 15/min per host and
`PeoplePanel` up to 30/min while ringing. A class starting put enough
concurrent pools in one isolate to run it out of memory.

`/api/sessions/[id]/guests` was the worst single offender: polled every 4s for
the whole length of every class, and doing five queries per poll (session
lookup, user lookup, an unconditional `UPDATE` that usually matched nothing,
the actual read, plus auth).

## What was done

1. **`withHttpDb()`** — the same Drizzle instance over Neon's HTTP endpoint.
   One `fetch` per query, no WebSocket, no pool, nothing to tear down. Used by
   the polled read routes: `/guests` GET, `/api/calls/incoming`,
   `/api/calls/[id]`, `/api/notifications/unread`.
2. **`/guests` GET trimmed** — skip the users lookup when the caller is the
   session's teacher, and only run the EXPIRED sweep when the read actually
   found something stale. Five queries per poll became two.
3. **Polls stop in a hidden tab**, and fire immediately on return. A
   backgrounded dashboard went from 24 req/min to zero; push already covers a
   user who is not looking at the page.
4. **Intervals raised** — knock poll 4s → 10s, ring poll 2s → 5s.
5. **`observability` enabled** in `wrangler.json`.

Measured afterwards on production: `/guests` on the HTTP driver 1.29s, versus
2.56s for a route still on the WebSocket pool. The pool was roughly half the
request.

## The rule

**Two database entry points, and the choice is not stylistic.**

- `withDb()` — WebSocket pool. Required for anything that opens a transaction:
  `db.transaction(...)`, `withRLS`, quota consumption. Costs a handshake and a
  socket.
- `withHttpDb()` — HTTP. For handlers that only read and write rows.
  `db.transaction(...)` **throws** there (`No transactions support in
  neon-http driver`) — that is the whole trade, and it is a runtime error, not
  a type error, so it will not be caught by `tsc`.

Better Auth resolves through the same `db` proxy, so wrapping a route in
`withHttpDb` moves session lookup onto HTTP with it. That is what makes the
saving real: without it, a "pool-free" route would still open a pool merely to
authenticate.

A handler already inside a `withDb` keeps that pool — nesting does not open a
second connection of a different kind alongside it.

**Before adding a new polled endpoint**, ask whether it can be `withHttpDb`,
whether it should stop when the tab is hidden, and whether the interval is as
long as the user experience actually tolerates.

## Diagnosing the next one

Workers Logs are on now, so start there. The archaeology below is what was
needed when they were off, and is still the fastest way to get per-path counts:

Account `6b8df46475fc4b356cd5979c1418780f`, zone `d6a05587cc0d41eded49b620c4e74fc3`.
Wrangler's OAuth token works as a Bearer token against the GraphQL API and is
readable from `~/Library/Preferences/.wrangler/config/default.toml`.

- `workersInvocationsAdaptive` (account scope, `scriptName: "novicetutor"`) —
  status plus `cpuTimeP50/P99`. Status **`exceededResources` is error 1102**.
  Low CPU with a long wall time means **memory**, not CPU.
- That dataset has no path dimension. Paths come from the zone's
  `httpRequestsAdaptiveGroups`, where **1102 appears as `edgeResponseStatus`
  503**.

## The other 25 MiB ceiling

Unrelated limit, same family of surprise: **a single Workers static asset is
capped at 25 MiB**. The Android APK crossed it and now lives in R2 — see
`mobile-app.md`. Anything large enough to be worth hosting should be streamed
from R2, never buffered in the Worker, and never stored in Postgres.
