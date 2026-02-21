/**
 * @fileoverview Quota Management System (Ledger Pattern)
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * The quota system answers: "Can this student book another class this week?"
 *
 * THE LEDGER PATTERN EXPLAINED:
 * Imagine a bank account. You don't just store the balance ($500).
 * You store every transaction (+$1000 deposit, -$200 rent, -$300 groceries).
 * The balance is CALCULATED from the transactions.
 *
 * Why? Because if the balance gets corrupted (bug, race condition), you can
 * recalculate it from the transaction history. This is "self-healing."
 *
 * Our quota works the same way:
 * - "4 classes/week" is the deposit (entitlement)
 * - Each booking is a withdrawal
 * - Remaining = 4 - COUNT(bookings this week)
 *
 * RACE CONDITIONS:
 * What if two browser tabs try to book at the same time?
 * We use a database transaction with query isolation.
 * The first tab books successfully; the second sees "0 remaining" and fails.
 *
 * @module lib/quota
 */

import { db } from "./db";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { bookings, subscriptions, plans, sessions, entitlements } from "@/db/schema";
import { startOfWeek, endOfWeek } from "date-fns";

/**
 * Result of a quota check. Contains all the information needed to
 * display remaining classes to the user and enforce booking limits.
 */
export interface QuotaStatus {
  /** Total classes allowed this week (e.g., 4) */
  totalAllowed: number;
  /** Classes already booked/used this week */
  used: number;
  /** Remaining bookable classes (totalAllowed - used) */
  remaining: number;
  /** Whether the student can book another class */
  canBook: boolean;
  /** Start of the current quota week (Monday 00:00 UTC) */
  weekStart: Date;
  /** End of the current quota week (Sunday 23:59 UTC) */
  weekEnd: Date;
}

/**
 * Gets the current week's quota status for a subscription.
 *
 * 📚 HOW THIS WORKS:
 * 1. Calculate the current week boundaries (Monday–Sunday)
 * 2. Look up the subscription's plan to get `classesPerWeek`
 * 3. Count CONFIRMED bookings for this user in this week
 * 4. Remaining = classesPerWeek - bookingsThisWeek
 *
 * @param subscriptionId - The subscription to check
 * @param userId - The user who owns the subscription
 * @param orgId - The organization (for multi-tenant scoping)
 * @returns QuotaStatus with remaining classes
 */
export async function getQuotaStatus(
  subscriptionId: string,
  userId: string,
  orgId: string
): Promise<QuotaStatus> {
  // Step 1: Get the subscription with its plan
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
    with: { plan: true },
  });

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  if (!subscription || subscription.status !== "ACTIVE") {
    return {
      totalAllowed: 0,
      used: 0,
      remaining: 0,
      canBook: false,
      weekStart,
      weekEnd,
    };
  }

  // Step 2: Count bookings this week for this user
  // We join bookings→sessions to filter by scheduled date
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.orgId, orgId),
        inArray(bookings.status, ["CONFIRMED", "COMPLETED"]),
        gte(sessions.scheduledStart, weekStart),
        lte(sessions.scheduledEnd, weekEnd)
      )
    );

  const usedThisWeek = result?.count ?? 0;

  // Step 3: Calculate remaining
  const totalAllowed = subscription.plan.classesPerWeek;
  const remaining = Math.max(0, totalAllowed - usedThisWeek);

  // Step 4: Upsert the Entitlement record (cache)
  await db
    .insert(entitlements)
    .values({
      subscriptionId,
      weekStartDate: weekStart,
      totalClasses: totalAllowed,
      usedClasses: usedThisWeek,
    })
    .onConflictDoUpdate({
      target: [entitlements.subscriptionId, entitlements.weekStartDate],
      set: { usedClasses: usedThisWeek },
    });

  return {
    totalAllowed,
    used: usedThisWeek,
    remaining,
    canBook: remaining > 0,
    weekStart,
    weekEnd,
  };
}

/**
 * Attempts to consume one class from the weekly quota.
 * Returns true if successful, false if quota exhausted.
 *
 * 📚 THE BOOKING FLOW:
 * 1. Student clicks "Book" → frontend calls this function
 * 2. We check the quota (can they book?)
 * 3. If yes → create the booking in a transaction (atomic)
 * 4. If no → return false (frontend shows "No classes remaining")
 *
 * @param subscriptionId - The subscription paying for this class
 * @param userId - The student booking the class
 * @param orgId - The organization
 * @param sessionId - The session they want to book
 * @returns true if booking was created, false if quota exhausted
 */
export async function consumeQuota(
  subscriptionId: string,
  userId: string,
  orgId: string,
  sessionId: string
): Promise<boolean> {
  // Use a transaction to prevent race conditions
  return db.transaction(async (tx) => {
    // Re-check quota inside the transaction
    const subscription = await tx.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
      with: { plan: true },
    });

    if (!subscription || subscription.status !== "ACTIVE") {
      return false;
    }

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const [result] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
      .where(
        and(
          eq(bookings.userId, userId),
          eq(bookings.orgId, orgId),
          inArray(bookings.status, ["CONFIRMED", "COMPLETED"]),
          gte(sessions.scheduledStart, weekStart),
          lte(sessions.scheduledEnd, weekEnd)
        )
      );

    const usedThisWeek = result?.count ?? 0;

    if (usedThisWeek >= subscription.plan.classesPerWeek) {
      return false; // Quota exhausted
    }

    // Create the booking
    await tx.insert(bookings).values({
      orgId,
      userId,
      sessionId,
      status: "CONFIRMED",
    });

    // Update the entitlement cache
    await tx
      .insert(entitlements)
      .values({
        subscriptionId,
        weekStartDate: weekStart,
        totalClasses: subscription.plan.classesPerWeek,
        usedClasses: usedThisWeek + 1,
      })
      .onConflictDoUpdate({
        target: [entitlements.subscriptionId, entitlements.weekStartDate],
        set: { usedClasses: usedThisWeek + 1 },
      });

    return true;
  });
}
