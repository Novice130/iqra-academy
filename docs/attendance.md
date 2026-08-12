# Attendance

Who turned up to each class, and when. Visible at `/dashboard/attendance` — an
`ORG_ADMIN` sees every class in the org, a `TEACHER` sees their own, a student
is redirected away.

## Why there is a new table

`session_attendees` has looked like this feature since the first migration:
`joined_at`, `left_at`, `duration_minutes`, and a unique index. **Nothing has
ever written a row to it**, and it structurally cannot answer the question that
was asked, because its foreign key points at `student_profiles` — the teacher's
arrival has no home in it.

`sessions.actualStart` doesn't answer it either. That is stamped by *whoever
walks in first*, student or teacher, which is deliberate (see "one class, one
room") and useless as a record of when the teacher arrived.

So: `session_attendance`, keyed on `user_id` with a `role` of
`TEACHER | STUDENT | OBSERVER`, which covers all three uniformly. The old table
is left alone rather than migrated — nothing reads it, so nothing breaks.

**One row per connection, append-only.** A student whose phone drops and who
comes back gets a second row, and the report can say "joined 6:02, dropped
6:31, back 6:33" instead of quietly rewriting history. The report collapses
connections per person when it needs a single arrival time, and shows a `×3`
next to anyone who reconnected.

`session_id` is always the **canonical** row for the occurrence, which comes
free: the join API has already resolved to it before it writes.

## Three writers, one closer

| When | Who writes | What |
| --- | --- | --- |
| Joining | `GET /api/sessions/[id]/join?connecting=1` | opens a row |
| Leaving cleanly | `POST /api/sessions/[id]/leave` (beacon) | closes it |
| Leaving *un*cleanly | `POST /api/webhooks/livekit` | closes it |
| Class ends | `POST /api/sessions/[id]/end` | closes whatever is left |

The join write is gated on `connecting=1`, not on page load: that route is hit
twice per join, and somebody who opens a class and then sits on the device
picker without joining did not attend it.

Everything closing a row goes through `closeAttendanceRows`
(`src/lib/attendance.ts`), which only ever fills a row where `left_at IS NULL`.
Whichever source lands first wins and the rest are no-ops. Durations are
computed in SQL against the row's own `joined_at` — never from a client clock —
and floored at zero.

**The beacon is the fast half, the webhook is the reliable half.** A phone the
OS kills never runs the beacon; LiveKit notices the connection die regardless.
Neither is trusted alone. A row still open when the report is read shows as
"still in class" rather than an invented departure time.

### The identity, and why the join route mints it

`generateLiveKitToken` used to build `email#random` internally and hand back
only the token, so nothing server-side knew which connection it had just
created. `makeIdentity()` is now exported and the join route passes the
identity in, which is what lets a `participant_left` webhook close the *right*
row when the same person is in the room twice.

Identities containing `#screen-` are skipped — that is the Android shell's
second connection publishing a screen, not a person.

## One-time setup: the LiveKit webhook

Until this is done, joins and ordinary leaves are recorded; only
crash-durations go missing.

> LiveKit Cloud → your project → **Settings → Webhooks** → add
> `https://novicetutor.com/api/webhooks/livekit`

The receiver verifies the `Authorization` header against a hash of the raw body
using `LIVEKIT_API_SECRET`, which is why the handler reads `request.text()` and
must not parse the body first. An unverifiable body gets a 401; anything else
gets a 200, because a webhook that 500s is retried forever for an event that
will never succeed.

## Grouping — the thing that is easy to get wrong

**A class is several session rows.** A group row plus one INDIVIDUAL row per
student is the normal shape here, and each person's dashboard links at their
own. Group the report by session id and a class of three reads as three classes
of one.

`groupIntoOccurrences` (`src/lib/class-room.ts`) is shared with the room
resolver on purpose — same teacher, scheduled starts within ±90 minutes,
earliest slot wins. A report that disagreed with the room resolver about what
"one class" is would be worse than no report.

The **expected roster** is read across *every* row of the occurrence, not just
the canonical one: a student's booking normally sits on their own INDIVIDUAL
row. Read the canonical row alone and every class shows nobody expected, so
nobody can ever be absent.

## Times

Every instant leaves the server as an ISO string and is formatted in the
browser. The page is under `/dashboard` specifically because that layout is the
only one wrapping children in `ViewerTimeZoneProvider`.

Days are bucketed with `dayKeyInZone` in the *viewer's* zone. A class at 23:00
UTC is Tuesday evening in Illinois and Wednesday morning in India; both are
right, and the question "which day was that class" has no server-side answer.
The server fetches a window a day wider on each side for exactly this reason.
See `timezones.md`.

The CSV export is built client-side from the data already on the page, so it
carries the viewer's times rather than the Worker's UTC — and it quotes cells,
which `api/admin/exports` still does not.
