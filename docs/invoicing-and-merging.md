# Invoicing, and combining classes

Two admin-facing things that were designed into the schema long before
anything used them. Both landed 2026-08-20.

## Raising an invoice

Families pay by bank transfer or Zelle after a fee is agreed over WhatsApp.
Stripe is wired up but is not how anybody actually pays here, which is why
`sendInvoiceEmail()` sat in `lib/email.ts` for months with no caller and every
real invoice this school has sent existed only in somebody's sent mail.

| Piece | Where |
| --- | --- |
| Screen | `/admin/invoices` — `apps/web/src/app/admin/invoices/` |
| API | `apps/web/src/app/api/admin/invoices/route.ts` |
| Email | `sendInvoiceEmail()` in `apps/web/src/lib/email.ts` |
| Columns | `issued_by_id`, `notes` — migration `0004_family_plans.sql` |

What it does:

1. Pick a family. Their active plan fills in the amount; a family with no
   plan is still in the list, just with no suggested figure.
2. The row is written `OPEN` (not `DRAFT` — it is being sent), with
   `issued_by_id` set to whoever raised it, and `stripe_invoice_id` left null.
   **Null `stripe_invoice_id` is how a hand-raised invoice is told apart from
   a Stripe one.**
3. The family gets the email, with the amount and a pay button if a payment
   link was pasted in.
4. They get an in-app notification too — **with no amount in it**. Prices are
   never shown inside the app; see `lib/pricing-visibility.ts` for why, and
   `docs/ios-release.md` § 3.1.1 for what it is protecting.
5. When the money lands, **Mark paid** stamps `paid_at` and fills
   `amount_paid_cents`. **Void** is for one raised in error and refuses to
   touch an invoice already paid — that is a refund, which is a different act.

Raising the same period twice for the same family is blocked while the first
one is unpaid, inside the transaction, so a double tap cannot bill twice.

`AuditAction` gained `INVOICE_ISSUED`, `INVOICE_PAID` and `INVOICE_VOIDED`
(migration `0005`). Only those three are logged: `OPEN` and `OVERDUE` are
bookkeeping and a log full of them buries the entries somebody goes looking
for.

## Combining two consecutive classes

A teacher with Aisha at 6:00 and Bilal at 6:30, both on the same surah, is
teaching one class twice. The dashboard now notices and offers to combine
them.

| Piece | Where |
| --- | --- |
| Rules | `apps/web/src/lib/class-merge.ts` |
| API | `apps/web/src/app/api/sessions/merge/route.ts` |
| UI | `CombineClasses` on the teacher dashboard — hidden when there is nothing to suggest |
| Column | `sessions.merged_into_id` — migration `0003` |

**Nothing is deleted.** Nine tables carry a foreign key to `sessions`;
deleting the absorbed row either fails on a constraint or, with a cascade,
takes a family's attendance and progress with it. So the absorbed row is set
`CANCELLED` with `merged_into_id` pointing at the survivor.

What moves: **bookings only**. A booking is a claim on a future class.
Everything else — attendance, feedback, progress, chat — is a record of
something that happened and stays on the row it happened on.

The guards, all re-checked server-side because the request body is not the
suggestion list:

- both `SCHEDULED`, both in the future, neither already merged
- same teacher (an admin can act for any teacher; a teacher only for their own)
- back to back — at most 30 minutes apart, overlaps included
- at most 4 students in the result
- never a trial class

Afterwards the survivor's `type` is re-derived (`SIBLINGS` for one family,
`GROUP` for two households) because `lib/quota.ts` bills against it, and its
title is rebuilt from the roster. Both families are notified in their own
timezone; the one being moved is told so explicitly.

**Undo exists.** `DELETE /api/sessions/merge` puts it back, moving exactly the
bookings the merge moved — read from the `SESSION_MERGED` audit entry, which
is the only record of which ones those were. If that entry is missing it
refuses rather than guessing.

Anyone landing on the old session — an old link, an old push — is redirected
by the join API, which follows `merged_into_id` before the room resolver runs.
The teacher's schedule, the week count and the attendance report all filter
merged rows out; leaving them in put the same class on the schedule twice.

## Deleting your own account

Not an admin feature, but it shipped with these and it is an App Store
requirement (5.1.1(v)): `apps/web/src/app/api/me/account/route.ts`, with the
card on `/dashboard/settings`. Students only — staff accounts are created by
an admin, not in the app, and a teacher deleting themselves would cancel other
people's classes.

It cancels upcoming classes (and any class left with nobody on it), cancels
the subscription, anonymises the account and the children's profiles, deletes
every login and push token, and emails the admins. **Invoices survive** — a
debt is not erased by closing the account it was raised against.

## Migrations

`0002`–`0005` are hand-written and applied by hand. Order matters: `0002` and
`0005` only add enum values, which Postgres refuses to let a later statement
*use* in the same transaction, so they must land and commit before the
migrations and deploys that reference them.

```sh
cd apps/web
npx drizzle-kit migrate       # or psql -f drizzle/000N_*.sql against Neon
```

`0003` deactivates every availability row belonging to a teacher with no
recorded timezone. Those hours are genuinely unknowable — the column defaulted
to `America/New_York` while the teacher entering them sat in Asia/Kolkata — and
an empty calendar is better than a student booking a guessed hour.
