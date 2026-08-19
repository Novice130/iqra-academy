# Test accounts and test classes

Two scripts, both safe to re-run, both in `apps/web/scripts`.

## Accounts

```
TEST_ACCOUNT_PASSWORD='...' npx tsx scripts/create-test-accounts.ts
```

Creates one teacher and three students, all in `seed_org_iqra_academy`, all
with `emailVerified` already true:

| Email | Role | Time zone |
| --- | --- | --- |
| `testteacher@test.com` | TEACHER | `Asia/Kolkata` |
| `teststudent1@test.com` | STUDENT | `America/Chicago` |
| `teststudent2@test.com` | STUDENT | `America/New_York` |
| `teststudent3@test.com` | STUDENT | `Asia/Kolkata` |

The three zones are deliberate. Class times are stored as instants and
rendered per viewer, and that only gets tested if the accounts disagree about
what time it is — one student sharing the teacher's zone is the control. See
`timezones.md`.

**The password is not in this repo.** It comes from `TEST_ACCOUNT_PASSWORD` at
creation time.

Existing accounts are reported and skipped, never reset — re-running will not
lock anyone out.

## A class to test with

```
npx tsx scripts/create-test-class.ts [minutesFromNow]   # default 10
npx tsx scripts/create-test-class.ts --clean
```

This builds the shape that actually breaks: a GROUP row for the teacher **plus
one INDIVIDUAL row per student**, all at the same slot, with each student
booked on both. That is how the class of 2026-08-06 was booked and it is why
three students ended up in three rooms — every dashboard links at a different
row.

Ten minutes out puts it inside the window where the room opens and "Start
Class" resumes it instead of creating something new.

## What's worth checking

- **One room.** Have a student open their own 1-on-1 link *before* anyone else.
  They should land in the call, not a lobby. The second student, from a
  different row, should land with them. The teacher, arriving last from the
  group row, should land with both. All three URLs converge on one session id.
- **Time zones.** The same class should read three hours to three people.
  Log in as each and compare the next-class card. A device deliberately set to
  the wrong country should make no difference — that's the point of the stored
  zone.
- **Guest link.** People panel → Copy guest invite link, open it in a private
  window, knock, admit from the host's prompt.
- **Removal.** Tile ⋮ → Remove from meeting, confirm, and check the removed
  person lands somewhere sensible rather than a login page.

## Cleaning up

`--clean` removes the test sessions and their bookings. It does not touch the
accounts; delete those directly if you need to, remembering that a user row has
FKs from `student_profiles`, `auth_sessions` and `accounts` at minimum.
