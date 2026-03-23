/**
 * @fileoverview Student Bookings API
 *
 * RBAC: STUDENT role
 * GET  /api/students/bookings — List bookings with quota status
 * POST /api/students/bookings — Book a new class (consumes quota)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
/** GET /api/students/bookings — returns bookings + weekly quota */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["STUDENT"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    return await withRLS(ctx, async (tx) => {
      const result = await tx.query.bookings.findMany({
        where: and(eq(bookings.userId, ctx.userId), eq(bookings.orgId, ctx.orgId)),
        with: {
          session: {
            columns: {
              id: true, title: true, type: true, status: true,
              scheduledStart: true, scheduledEnd: true,
            },
            with: { teacher: { columns: { name: true } } },
          },
        },
        orderBy: desc(bookings.createdAt),
        limit: 50,
      });

      // Get quota status for active subscription
      const subscription = await tx.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.orgId, ctx.orgId),
          eq(subscriptions.status, "ACTIVE"),
        ),
      });

      let quota = null;
      if (subscription) {
        quota = await getQuotaStatus(subscription.id, ctx.userId, ctx.orgId);
      }

      return NextResponse.json({ bookings: result, quota });
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/students/bookings — book a class, consuming weekly quota */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["STUDENT"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const { sessionId } = bookingSchema.parse(body);

    return await withRLS(ctx, async (tx) => {
      // Verify session exists and is bookable
      const session = await tx.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });
      if (!session || session.orgId !== ctx.orgId) {
        throw new NotFoundError("Session");
      }
      if (session.status !== "SCHEDULED") {
        throw new BusinessRuleError("This session is no longer available for booking.");
      }

      // Get active subscription
      const subscription = await tx.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.orgId, ctx.orgId),
          eq(subscriptions.status, "ACTIVE"),
        ),
      });
      if (!subscription) {
        throw new BusinessRuleError("You need an active subscription to book classes.");
      }

      // Consume quota (atomic — handles race conditions)
      const booked = await consumeQuota(subscription.id, ctx.userId, ctx.orgId, sessionId);
      if (!booked) {
        throw new BusinessRuleError("Weekly class quota exhausted. You have used all 4 classes this week.");
      }

      await logAudit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "BOOKING_CREATED",
        target: `session:${sessionId}`,
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ success: true, message: "Class booked successfully!" }, { status: 201 });
    });
  } catch (error) {
    return handleApiError(error);
  }
}
