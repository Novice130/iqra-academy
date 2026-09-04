# Times and time zones

A teacher in India teaching students in Illinois means every displayed time is
a conversion, and getting it wrong is not cosmetic — it is students missing
class. This is how it works and where it has broken before.

## The rule

**Store instants. Format in the viewer's zone. Never do either on the server.**

`sessions.scheduledStart` and friends are absolute instants. There is exactly
one correct moment for a class; what differs is how it reads to each person.

## What broke, twice

**1. Formatting server-side.** Cloudflare Workers run in UTC, so a 4:30 AM IST
class was formatted as "11:00 PM" and sent to everyone — teacher, Illinois,
Washington alike. Fixed by `src/components/LocalTime.tsx`, which formats in the
browser with `Intl`. That also gets DST right for free: the US switches, India
doesn't, and every browser ships the IANA rules.

`LocalTime` deliberately renders UTC on its first pass so the server HTML and
the client's first render agree, then swaps in the real zone in an effect.
Doing it the other way round either warns about hydration or leaves stale UTC
text on screen.

**2. Trusting the device.** Formatting in the browser is right until the
browser is wrong. Students in Illinois on phones still set to India time were
shown 4:30 AM — their teacher's hour — because that is genuinely what their
device believed. Reported after a real class on 2026-08-06.

So `users.timezone` (nullable IANA string) holds the account's own zone.
`src/app/dashboard/layout.tsx` reads it and feeds it to every dashboard page
through `ViewerTimeZoneProvider`; `LocalTime` and `useViewerTimeZone` prefer it
and only consult the device when it is null. Students set it themselves in
Settings → Time zone, backed by `GET`/`PATCH /api/me/timezone`.

Currently set: Sobur and Bkyt `America/Chicago`, Malek `America/New_York`,
Masad `Asia/Kolkata`. The class at 23:00 UTC therefore reads 6:00 PM, 7:00 PM
and 4:30 AM respectively — one instant, three correct answers.

## The gotcha when inspecting the database

The timestamp columns are `timestamp` **without** time zone, and the developer
machine is on IST. `psql` and the node clients apply the local offset on read,
so a row the app treats as 23:00 UTC comes back printed as `17:30Z` — shifted
by −5:30.

**Do not "fix" data based on that.** It has already looked like a bug once and
wasn't. Check what the *app* renders before concluding a stored value is wrong.

## Where times are rendered

Anything showing a session time uses `LocalTime` (or `formatInZone` for
strings): the student dashboard's next-class card, `TodaySchedule`, `WeekGrid`,
the session lobby, teacher student details (`/dashboard/teacher/students/[id]`),
and the admin scheduled classes matrix (`/admin/scheduled-classes`). All timestamps
are client-formatted according to the viewer's explicit account timezone (`users.timezone`)
or browser locale, guaranteeing midnight boundaries and daylight savings transitions
render accurately without server UTC drift.
