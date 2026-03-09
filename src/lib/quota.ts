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
 * SIBLINGS PLAN HANDLING:
 * The Siblings plan gives 4 classes/week PER CHILD, not per account.
 * So a family with 3 kids gets 12 total classes/week (4 × 3).
 * We track entitlements per-child by using `studentProfileId` on the
 * entitlements table.
 *
 * RACE CONDITIONS:
 * What if two browser tabs try to book at the same time?
 * We use a database transaction with query isolation.
 * The first tab books successfully; the second sees "0 remaining" and fails.
 *
 * @module lib/quota
 */

import { db } from "./db";
import { eq, and, gte, lte, inArray, sql, isNull } from "drizzle-orm";
import {
  bookings,
  subscriptions,
  plans,
  sessions,
  entitlements,
  studentProfiles,
} from "@/db/schema";
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
  /** Student profile ID (for Siblings plan per-child tracking) */
  studentProfileId?: string;
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
 * FOR SIBLINGS PLAN:
 * - If `studentProfileId` is provided, we check quota per-child.
 * - Each child gets `classesPerWeek` independently.
 * - Without a profileId, returns the aggregate for ALL children.
 *
 * @param subscriptionId - The subscription to check
 * @param userId - The user who owns the subscription
 * @param orgId - The organization (for multi-tenant scoping)
 * @param studentProfileId - Optional: check quota for a specific child (Siblings plan)
 * @returns QuotaStatus with remaining classes
 */
export async function getQuotaStatus(
  subscriptionId: string,
  userId: string,
  orgId: string,
  studentProfileId?: string
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
      studentProfileId,
    };
  }

  const isSiblingsPlan = subscription.plan.tier === "SIBLINGS";

  // Step 2: Count bookings this week
  // For Siblings plan with profileId: count only that child's bookings
  // For other plans: count all bookings for this user
  const bookingConditions = [
    eq(bookings.userId, userId),
    eq(bookings.orgId, orgId),
    inArray(bookings.status, ["CONFIRMED", "COMPLETED"]),
    gte(sessions.scheduledStart, weekStart),
    lte(sessions.scheduledEnd, weekEnd),
  ];

  // For Siblings plan, filter by specific child profile
  if (isSiblingsPlan && studentProfileId) {
    bookingConditions.push(
      eq(bookings.studentProfileId, studentProfileId)
    );
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
    .where(and(...bookingConditions));

  const usedThisWeek = result?.count ?? 0;

  // Step 3: Calculate remaining
  // For Siblings plan: each child gets `classesPerWeek` independently
  const totalAllowed = subscription.plan.classesPerWeek;
  const remaining = Math.max(0, totalAllowed - usedThisWeek);

  // Step 4: Upsert the Entitlement record (cache)
  await db
    .insert(entitlements)
    .values({
      subscriptionId,
      studentProfileId: isSiblingsPlan ? studentProfileId : null,
      weekStartDate: weekStart,
      totalClasses: totalAllowed,
      usedClasses: usedThisWeek,
    })
    .onConflictDoUpdate({
      target: [
        entitlements.subscriptionId,
        entitlements.weekStartDate,
        entitlements.studentProfileId,
      ],
      set: { usedClasses: usedThisWeek },
    });

  return {
    totalAllowed,
    used: usedThisWeek,
    remaining,
    canBook: remaining > 0,
    weekStart,
    weekEnd,
    studentProfileId,
  };
}

/**
 * Gets quota status for ALL children under a Siblings subscription.
 *
 * 📚 USE CASE: On the parent's dashboard, show each child's remaining
 * classes side by side: "Aisha: 3 left | Yusuf: 2 left | Zahra: 4 left"
 *
 * @param subscriptionId - The Siblings subscription
 * @param userId - The parent user
 * @param orgId - The organization
 * @returns Array of QuotaStatus, one per child profile
 */
export async function getSiblingsQuotaStatus(
  subscriptionId: string,
  userId: string,
  orgId: string
): Promise<QuotaStatus[]> {
  // Get all child profiles for this user
  const profiles = await db.query.studentProfiles.findMany({
    where: and(
      eq(studentProfiles.userId, userId),
      eq(studentProfiles.orgId, orgId)
    ),
  });

  // Get quota for each child independently
  const quotas = await Promise.all(
    profiles.map((profile) =>
      getQuotaStatus(subscriptionId, userId, orgId, profile.id)
    )
  );

  return quotas;
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
 * FOR SIBLINGS PLAN:
 * The `studentProfileId` is REQUIRED. Each child's quota is checked
 * independently. Booking 1 class for Aisha doesn't affect Yusuf's quota.
 *
 * WEBINAR EXEMPTION:
 * Free-tier webinars don't consume quota (they're unlimited).
 * Check `session.consumesQuota` before calling this function.
 *
 * @param subscriptionId - The subscription paying for this class
 * @param userId - The student booking the class
 * @param orgId - The organization
 * @param sessionId - The session they want to book
 * @param studentProfileId - Which child profile is attending (required for Siblings)
 * @returns true if booking was created, false if quota exhausted
 */
export async function consumeQuota(
  subscriptionId: string,
  userId: string,
  orgId: string,
  sessionId: string,
  studentProfileId?: string
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

    // Check if the session actually consumes quota
    const session = await tx.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return false;
    }

    // Webinars and ad-hoc sessions may not consume quota
    if (!session.consumesQuota) {
      // Create the booking without checking quota
      await tx.insert(bookings).values({
        orgId,
        userId,
        studentProfileId,
        sessionId,
        status: "CONFIRMED",
      });
      return true;
    }

    const isSiblingsPlan = subscription.plan.tier === "SIBLINGS";

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    // Build booking count conditions
    const bookingConditions = [
      eq(bookings.userId, userId),
      eq(bookings.orgId, orgId),
      inArray(bookings.status, ["CONFIRMED", "COMPLETED"]),
      gte(sessions.scheduledStart, weekStart),
      lte(sessions.scheduledEnd, weekEnd),
    ];

    if (isSiblingsPlan && studentProfileId) {
      bookingConditions.push(eq(bookings.studentProfileId, studentProfileId));
    }

    const [result] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
      .where(and(...bookingConditions));

    const usedThisWeek = result?.count ?? 0;

    if (usedThisWeek >= subscription.plan.classesPerWeek) {
      return false; // Quota exhausted
    }

    // Create the booking
    await tx.insert(bookings).values({
      orgId,
      userId,
      studentProfileId,
      sessionId,
      status: "CONFIRMED",
    });

    // Update the entitlement cache
    await tx
      .insert(entitlements)
      .values({
        subscriptionId,
        studentProfileId: isSiblingsPlan ? studentProfileId : null,
        weekStartDate: weekStart,
        totalClasses: subscription.plan.classesPerWeek,
        usedClasses: usedThisWeek + 1,
      })
      .onConflictDoUpdate({
        target: [
          entitlements.subscriptionId,
          entitlements.weekStartDate,
          entitlements.studentProfileId,
        ],
        set: { usedClasses: usedThisWeek + 1 },
      });

    return true;
  });
}
