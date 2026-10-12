# Load test notes

## 2026-10-13: local smoke only (not a capacity number)

Target: a throwaway stack on the Mac, built from `d62ffff` plus the sign-up
fix. Next standalone server and the realtime sidecar run with plain `node`,
Postgres 15 in a container on the same machine, LiveKit pointed at nothing.
The database is local, so response times say nothing about production, where
each query crosses to Neon.

Run: 22 users (about 6 visitors, 10 students, 2 teachers, 4 guests), 5 minutes.

| Measure | Result |
|---|---|
| Requests | 2271, 7.6 a second |
| HTTP failures | 0 |
| Median / p95 | 14 ms / 31 ms |
| Slowest journey step | sign in, median 79 ms (password hashing) |
| Classes started and ended | 12 / 10 (2 still open when the run stopped) |
| Guests admitted | 16 |
| Realtime sockets | 10 connected and stayed connected |
| Web process memory after the run | about 250 MB resident |

Found while writing the test:

1. **Sign-up was broken.** `POST /api/auth/sign-up/email` answered 422: the
   org id set by the sign-up hook was dropped before the insert, and
   `users.org_id` is NOT NULL with no default. Fixed in `src/lib/auth.ts`.
2. **The sign-in limit is not a sliding window.** The count resets only after
   60 seconds without any sign-in from that address. A school behind one
   address with a steady trickle of sign-ins will lock itself out after the
   tenth. Not changed; a decision for the owner.
3. A realtime socket that is never read is dropped after about 30 seconds
   (it does not answer pings). That is the server working as designed; the
   test now reads its socket.

Not done: any run against a deployed server. No staging exists.
