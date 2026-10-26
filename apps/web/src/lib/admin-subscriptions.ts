/**
 * @fileoverview Reads and shared rules for /admin/plans and the
 * api/admin/subscriptions + api/admin/plans routes.
 *
 * Until this existed nothing created a subscription except the seed script;
 * the Stripe webhook only updates rows that are already there. This school
 * bills by hand (admin-issued invoices), so a manual subscription row — no
 * Stripe id, MANUAL_INVOICE — is the normal case and is what the admin
 * actions write. A row with `stripeSubscriptionId` set belongs to Stripe and
 * is never edited from here: the webhook would overwrite the change.
 *
 * ── One subscription per family ─────────────────────────────────────────────
 * Quota (lib/quota.ts) hangs every child's weekly allowance off ONE family
 * subscription — per-child plans (isPerChildPlan) key entitlements by
 * studentProfileId under that same row — and every booking route reads "the"
 * ACTIVE subscription with findFirst. A second live row would make which plan
 * applies depend on row order, so the API refuses one.
 *
 * ── Why the quota column here does not call getQuotaStatus ──────────────────
 * getQuotaStatus upserts an entitlements row, and the unique index it upserts
 * against includes student_profile_id, which is NULL for a family-level
 * check. Postgres treats NULLs as distinct, so the ON CONFLICT never fires
 * and every call inserts a fresh row. Calling it 25 times per page view would
 * grow that table on every refresh. `weeklyUsage` below runs the same count
 * (same week, same statuses, same per-child rule) without writing.
 *
 * @module lib/admin-subscriptions
 */

import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { startOfWeek, endOfWeek } from "date-fns";
import { db } from "@/lib/db";
import { bookings, plans, sessions, studentProfiles, subscriptions, users } from "@/db/schema";
import { orgFilter, type AdminContext } from "@/lib/admin-page";
import { isPerChildPlan } from "@/lib/quota";
import { logAuditBatch } from "@/lib/audit";
import { zonedWallClockToInstant } from "@/lib/slots";

/** Statuses that make a subscription "the family's current one". */
export const LIVE_STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE", "UNPAID", "PAUSED"] as const;

export const SUBS_PAGE_SIZE = 25;

/** "live" is the default view: everything except cancelled. */
export const SUB_FILTERS = ["live", "ACTIVE", "PAUSED", "PAST_DUE", "CANCELLED", "all"] as const;
export type SubFilter = (typeof SUB_FILTERS)[number];

export interface PlanRow {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  tier: string;
  sessionType: string;
  priceInCents: number;
  currency: string;
  classesPerWeek: number;
  maxStudents: number;
  isActive: boolean;
  /** Linked to a Stripe price: amount and currency are fixed there. */
  stripeLinked: boolean;
  activeCount: number;
  liveCount: number;
}

export interface SubscriptionRow {
  id: string;
  userId: string;
  familyName: string;
  familyEmail: string;
  /** First child profile, for the student 360 link. */
  profileId: string | null;
  planId: string;
  planName: string;
  tier: string;
  status: string;
  paymentMethod: string;
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  /** Set when Stripe owns this row; it is read-only here. */
  stripeSubscriptionId: string | null;
  /** Manual, still live, and its period is behind us: needs extending or ending. */
  periodOver: boolean;
  /** This week's classes, for an ACTIVE row only. */
  usage: { used: number; allowed: number; children: number; perChild: boolean } | null;
}

export interface FamilyOption {
  id: string;
  label: string;
  /** Name of the plan the family is already on, if any. */
  currentPlan: string | null;
}

/** The instant a calendar day starts in `zone`. */
export function dayStartInZone(key: string, zone: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return zonedWallClockToInstant(y, m, d, 0, 0, zone);
}

/**
 * Ends manual subscriptions that were set to cancel at period end and whose
 * period has passed.
 *
 * Stripe flips its own rows through the webhook; nothing flips ours, and
 * there is no scheduler on this deployment. Without this a "cancelled at
 * period end" family would stay ACTIVE and keep booking indefinitely. It runs
 * when the plans page loads and before a plan is assigned — so it is only as
 * prompt as the next admin visit. A scheduled job would close that gap.
 */
export async function settleLapsedCancellations(
  executor: typeof db,
  orgId: string | null
): Promise<number> {
  const now = new Date();
  const ended = await executor
    .update(subscriptions)
    .set({ status: "CANCELLED", cancelAtPeriodEnd: false })
    .where(
      and(
        orgId ? eq(subscriptions.orgId, orgId) : undefined,
        isNull(subscriptions.stripeSubscriptionId),
        eq(subscriptions.cancelAtPeriodEnd, true),
        lte(subscriptions.currentPeriodEnd, now),
        inArray(subscriptions.status, [...LIVE_STATUSES])
      )
    )
    .returning({ id: subscriptions.id, orgId: subscriptions.orgId, userId: subscriptions.userId });

  if (ended.length > 0) {
    await logAuditBatch(
      ended.map((s) => ({
        orgId: s.orgId,
        actorId: null,
        action: "SUBSCRIPTION_CANCELLED" as const,
        target: `subscription:${s.id}`,
        metadata: { op: "subscription.cancel.period_end_reached", userId: s.userId },
      }))
    );
  }
  return ended.length;
}

/** Every plan the admin can see, with how many families are on each. */
export async function loadPlans(admin: AdminContext): Promise<PlanRow[]> {
  const rows = await db
    .select({
      id: plans.id,
      orgId: plans.orgId,
      name: plans.name,
      description: plans.description,
      tier: plans.tier,
      sessionType: plans.sessionType,
      priceInCents: plans.priceInCents,
      currency: plans.currency,
      classesPerWeek: plans.classesPerWeek,
      maxStudents: plans.maxStudents,
      isActive: plans.isActive,
      stripePriceId: plans.stripePriceId,
      activeCount: sql<number>`(count(${subscriptions.id}) filter (where ${subscriptions.status} = 'ACTIVE'))::int`,
      liveCount: sql<number>`(count(${subscriptions.id}) filter (where ${inArray(subscriptions.status, [...LIVE_STATUSES])}))::int`,
    })
    .from(plans)
    .leftJoin(subscriptions, eq(subscriptions.planId, plans.id))
    .where(orgFilter(admin, plans.orgId))
    .groupBy(plans.id)
    .orderBy(desc(plans.isActive), asc(plans.priceInCents));

  return rows.map(({ stripePriceId, ...r }) => ({ ...r, stripeLinked: !!stripePriceId }));
}

/** Families (STUDENT accounts) for the assign form, with any plan they hold. */
export async function loadFamilyOptions(admin: AdminContext): Promise<FamilyOption[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      planName: plans.name,
    })
    .from(users)
    .leftJoin(
      subscriptions,
      and(eq(subscriptions.userId, users.id), inArray(subscriptions.status, [...LIVE_STATUSES]))
    )
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(orgFilter(admin, users.orgId), eq(users.role, "STUDENT"), isNull(users.deletedAt)))
    .orderBy(asc(users.name));

  const seen = new Map<string, FamilyOption>();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.set(r.id, { id: r.id, label: r.name ? `${r.name} (${r.email})` : r.email, currentPlan: r.planName });
  }
  return [...seen.values()];
}

export async function loadSubscriptionCounts(admin: AdminContext) {
  const now = new Date();
  const [row] = await db
    .select({
      active: sql<number>`(count(*) filter (where ${subscriptions.status} = 'ACTIVE'))::int`,
      paused: sql<number>`(count(*) filter (where ${subscriptions.status} = 'PAUSED'))::int`,
      ending: sql<number>`(count(*) filter (where ${subscriptions.cancelAtPeriodEnd} and ${inArray(subscriptions.status, [...LIVE_STATUSES])}))::int`,
      periodOver: sql<number>`(count(*) filter (where ${and(
        isNull(subscriptions.stripeSubscriptionId),
        inArray(subscriptions.status, [...LIVE_STATUSES]),
        lte(subscriptions.currentPeriodEnd, now)
      )}))::int`,
    })
    .from(subscriptions)
    .where(orgFilter(admin, subscriptions.orgId));
  return row ?? { active: 0, paused: 0, ending: 0, periodOver: 0 };
}

/**
 * This week's booked classes per family, read-only. Mirrors getQuotaStatus:
 * Monday-to-Sunday week (date-fns, server clock), CONFIRMED or COMPLETED
 * bookings on sessions inside it; a per-child plan allows `classesPerWeek`
 * for each child on the account.
 */
async function weeklyUsage(familyIds: string[]) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  if (familyIds.length === 0) return { used: new Map<string, number>(), children: new Map<string, number>() };

  const [usedRows, childRows] = await Promise.all([
    db
      .select({ userId: bookings.userId, n: count() })
      .from(bookings)
      .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
      .where(
        and(
          inArray(bookings.userId, familyIds),
          inArray(bookings.status, ["CONFIRMED", "COMPLETED"]),
          gte(sessions.scheduledStart, weekStart),
          lte(sessions.scheduledEnd, weekEnd)
        )
      )
      .groupBy(bookings.userId),
    db
      .select({ userId: studentProfiles.userId, n: count() })
      .from(studentProfiles)
      .where(inArray(studentProfiles.userId, familyIds))
      .groupBy(studentProfiles.userId),
  ]);
  return {
    used: new Map(usedRows.map((r) => [r.userId, r.n])),
    children: new Map(childRows.map((r) => [r.userId, r.n])),
  };
}

/** One page of subscriptions, newest first, with this week's usage per row. */
export async function loadSubscriptionPage(
  admin: AdminContext,
  opts: { filter: SubFilter; page: number; planId?: string; userId?: string }
): Promise<{ rows: SubscriptionRow[]; total: number }> {
  const conds: (SQL | undefined)[] = [orgFilter(admin, subscriptions.orgId)];
  if (opts.filter === "live") conds.push(inArray(subscriptions.status, [...LIVE_STATUSES]));
  else if (opts.filter !== "all") conds.push(eq(subscriptions.status, opts.filter));
  if (opts.planId) conds.push(eq(subscriptions.planId, opts.planId));
  if (opts.userId) conds.push(eq(subscriptions.userId, opts.userId));
  const where = and(...conds);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        familyName: users.name,
        familyEmail: users.email,
        planId: subscriptions.planId,
        planName: plans.name,
        tier: plans.tier,
        classesPerWeek: plans.classesPerWeek,
        status: subscriptions.status,
        paymentMethod: subscriptions.paymentMethod,
        periodStart: subscriptions.currentPeriodStart,
        periodEnd: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(where)
      .orderBy(desc(subscriptions.createdAt))
      .limit(SUBS_PAGE_SIZE)
      .offset(opts.page * SUBS_PAGE_SIZE),
    db.select({ total: count() }).from(subscriptions).where(where),
  ]);

  const familyIds = [...new Set(rows.map((r) => r.userId))];
  const [usage, profiles] = await Promise.all([
    weeklyUsage(familyIds.filter((id) => rows.some((r) => r.userId === id && r.status === "ACTIVE"))),
    familyIds.length
      ? db
          .select({ id: studentProfiles.id, userId: studentProfiles.userId })
          .from(studentProfiles)
          .where(inArray(studentProfiles.userId, familyIds))
          .orderBy(asc(studentProfiles.createdAt))
      : Promise.resolve([]),
  ]);
  const profileOf = new Map<string, string>();
  for (const p of profiles) if (!profileOf.has(p.userId)) profileOf.set(p.userId, p.id);

  const now = new Date();
  return {
    total,
    rows: rows.map((r) => {
      const live = (LIVE_STATUSES as readonly string[]).includes(r.status);
      const perChild = isPerChildPlan(r.tier);
      const children = usage.children.get(r.userId) ?? 0;
      return {
        id: r.id,
        userId: r.userId,
        familyName: r.familyName,
        familyEmail: r.familyEmail,
        profileId: profileOf.get(r.userId) ?? null,
        planId: r.planId,
        planName: r.planName,
        tier: r.tier,
        status: r.status,
        paymentMethod: r.paymentMethod,
        periodStart: r.periodStart.toISOString(),
        periodEnd: r.periodEnd.toISOString(),
        cancelAtPeriodEnd: r.cancelAtPeriodEnd,
        stripeSubscriptionId: r.stripeSubscriptionId,
        periodOver: live && !r.stripeSubscriptionId && r.periodEnd <= now,
        usage:
          r.status === "ACTIVE"
            ? {
                used: usage.used.get(r.userId) ?? 0,
                allowed: r.classesPerWeek * (perChild ? Math.max(1, children) : 1),
                children,
                perChild,
              }
            : null,
      };
    }),
  };
}
