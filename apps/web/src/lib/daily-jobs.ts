/**
 * @fileoverview The once-a-day billing sweep behind POST /api/cron/daily.
 *
 * Two things nothing else does on time:
 *
 *   1. **Overdue invoices.** A hand-raised invoice (no Stripe id) that is OPEN
 *      and past its due date becomes OVERDUE, and the family gets one
 *      reminder email. The flip is a conditional UPDATE ... WHERE status =
 *      'OPEN', so each invoice is flipped, and reminded, exactly once however
 *      often the job runs or if two runs overlap. Stripe's own invoices are
 *      left alone: Stripe sends its own dunning and the webhook owns their
 *      status.
 *   2. **Manual subscriptions at period end.** Those set to cancel at period
 *      end are ended (settleLapsedCancellations). Those whose period simply
 *      ran out are NOT ended or paused: for a school that bills by hand that
 *      usually means an admin has not extended them yet, and cutting a
 *      family off for that is worse than telling the admin. They are
 *      reported instead.
 *
 * Each org's admins get one summary email when anything changed, or when a
 * manual subscription's period ran out in the last day. Quiet days send
 * nothing.
 *
 * A bare OPEN to OVERDUE flip is not written to the audit log, the same rule
 * api/admin/invoices follows for admins (bookkeeping, not money moving).
 * Subscription endings are audited by settleLapsedCancellations.
 *
 * @module lib/daily-jobs
 */

import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices, organizations, subscriptions, users } from "@/db/schema";
import { LIVE_STATUSES, settleLapsedCancellations } from "@/lib/admin-subscriptions";
import { sendInvoiceOverdueEmail } from "@/lib/email";
import { getAdminRecipients, notify } from "@/lib/notify";
import { money } from "@/lib/money";
import { isValidZone } from "@/lib/zones";

/** Bounds one run. Anything beyond it is picked up by the next run. */
const OVERDUE_BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyJobResult {
  invoicesMarkedOverdue: number;
  remindersSent: number;
  subscriptionsEnded: number;
  /** Manual, still live, period over: needs an admin to extend or end it. */
  subscriptionsPeriodOver: number;
  adminSummariesSent: number;
}

function dateLabel(d: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: isValidZone(zone) ? zone : "UTC",
  }).format(d);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export async function runDailyJobs(now = new Date()): Promise<DailyJobResult> {
  // 1. Overdue invoices. Pick the ids first so the batch is bounded, then
  //    flip only those still OPEN.
  const due = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, "OPEN"),
        isNull(invoices.stripeInvoiceId),
        isNotNull(invoices.dueDate),
        lt(invoices.dueDate, now)
      )
    )
    .orderBy(invoices.dueDate)
    .limit(OVERDUE_BATCH);

  const flipped = due.length
    ? await db
        .update(invoices)
        .set({ status: "OVERDUE" })
        .where(and(inArray(invoices.id, due.map((d) => d.id)), eq(invoices.status, "OPEN")))
        .returning({
          id: invoices.id,
          orgId: invoices.orgId,
          userId: invoices.userId,
          amountDueCents: invoices.amountDueCents,
          amountPaidCents: invoices.amountPaidCents,
          currency: invoices.currency,
          dueDate: invoices.dueDate,
          hostedInvoiceUrl: invoices.hostedInvoiceUrl,
        })
    : [];

  let remindersSent = 0;
  if (flipped.length > 0) {
    const [families, orgs] = await Promise.all([
      db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(inArray(users.id, [...new Set(flipped.map((f) => f.userId))]), isNull(users.deletedAt))),
      db
        .select({ id: organizations.id, name: organizations.name, timezone: organizations.timezone })
        .from(organizations)
        .where(inArray(organizations.id, [...new Set(flipped.map((f) => f.orgId))])),
    ]);
    const familyOf = new Map(families.map((f) => [f.id, f]));
    const orgOf = new Map(orgs.map((o) => [o.id, o]));

    // Sequential on purpose: Resend's free plan rate-limits bursts, and a
    // daily job has time to spare.
    for (const inv of flipped) {
      const family = familyOf.get(inv.userId);
      const org = orgOf.get(inv.orgId);
      if (!family?.email || !org) continue;
      const ok = await sendInvoiceOverdueEmail(family.email, {
        name: family.name || "there",
        orgName: org.name,
        amount: money(Math.max(0, inv.amountDueCents - inv.amountPaidCents), inv.currency),
        dueLabel: dateLabel(inv.dueDate!, org.timezone),
        payUrl: inv.hostedInvoiceUrl ?? undefined,
      });
      if (ok) remindersSent++;
    }
  }

  // 2. Subscriptions.
  const ended = await settleLapsedCancellations(db, null);

  const periodOver = await db
    .select({
      orgId: subscriptions.orgId,
      total: sql<number>`count(*)::int`,
      lastDay: sql<number>`(count(*) filter (where ${gt(subscriptions.currentPeriodEnd, new Date(now.getTime() - DAY_MS))}))::int`,
    })
    .from(subscriptions)
    .where(
      and(
        isNull(subscriptions.stripeSubscriptionId),
        inArray(subscriptions.status, [...LIVE_STATUSES]),
        lte(subscriptions.currentPeriodEnd, now)
      )
    )
    .groupBy(subscriptions.orgId);

  // 3. One summary per org, only when there is news.
  const orgIds = new Set<string>([
    ...flipped.map((f) => f.orgId),
    ...ended.map((e) => e.orgId),
    ...periodOver.filter((p) => p.lastDay > 0).map((p) => p.orgId),
  ]);
  let adminSummariesSent = 0;
  for (const orgId of orgIds) {
    const overdueN = flipped.filter((f) => f.orgId === orgId).length;
    const endedN = ended.filter((e) => e.orgId === orgId).length;
    const over = periodOver.find((p) => p.orgId === orgId);
    const lines: string[] = [];
    if (overdueN) lines.push(`${plural(overdueN, "invoice is", "invoices are")} now overdue; the families were sent a reminder.`);
    if (endedN) lines.push(`${plural(endedN, "manual subscription", "manual subscriptions")} reached period end and ${endedN === 1 ? "was" : "were"} cancelled as scheduled.`);
    if (over?.total) lines.push(`${plural(over.total, "manual subscription is", "manual subscriptions are")} past period end and need extending or ending.`);

    const { emails } = await getAdminRecipients(orgId);
    if (emails.length === 0) continue;
    await notify({
      orgId,
      emails,
      type: "INVOICE_ISSUED",
      title: "Billing: daily summary",
      body: lines.join(" "),
      path: overdueN ? "/admin/invoices?status=OVERDUE" : "/admin/plans",
      channels: ["email"],
    });
    adminSummariesSent++;
  }

  return {
    invoicesMarkedOverdue: flipped.length,
    remindersSent,
    subscriptionsEnded: ended.length,
    subscriptionsPeriodOver: periodOver.reduce((n, p) => n + p.total, 0),
    adminSummariesSent,
  };
}
