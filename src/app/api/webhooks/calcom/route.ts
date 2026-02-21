/**
 * @fileoverview Cal.com Webhook Handler
 *
 * 📚 EDUCATIONAL NOTE:
 * Cal.com sends webhooks when bookings are created/cancelled/rescheduled.
 * We use these to create Session records and consume quota slots.
 *
 * @module api/webhooks/calcom
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";
import { users, sessions, bookings } from "@/db/schema";
import { verifyCalcomWebhook, mapCalcomEventType } from "@/lib/calcom";
import type { CalcomWebhookPayload } from "@/lib/calcom";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Step 1: Verify webhook signature
  const body = await request.text();
  const signature = request.headers.get("x-cal-signature-256") || "";

  if (!verifyCalcomWebhook(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event: CalcomWebhookPayload = JSON.parse(body);

  try {
    switch (event.triggerEvent) {
      case "BOOKING_CREATED":
      case "BOOKING_CONFIRMED":
        await handleBookingCreated(event);
        break;

      case "BOOKING_CANCELLED":
        await handleBookingCancelled(event);
        break;

      case "BOOKING_RESCHEDULED":
        await handleBookingRescheduled(event);
        break;

      default:
        console.log(`[CALCOM] Unhandled event: ${event.triggerEvent}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[CALCOM] Error handling ${event.triggerEvent}:`, error);
    return NextResponse.json({ received: true });
  }
}

/** Creates a Session and Booking from a Cal.com booking event */
async function handleBookingCreated(event: CalcomWebhookPayload) {
  const { payload } = event;
  const orgId = payload.metadata?.orgId;
  const userId = payload.metadata?.userId;
  if (!orgId || !userId) {
    console.warn("[CALCOM] Missing orgId/userId in booking metadata");
    return;
  }

  const sessionType = mapCalcomEventType(payload.eventTypeId) || "INDIVIDUAL";

  // Find teacher by email
  const teacher = await db.query.users.findFirst({
    where: and(
      eq(users.email, payload.organizer.email),
      eq(users.orgId, orgId),
      eq(users.role, "TEACHER"),
    ),
  });
  if (!teacher) {
    console.warn(`[CALCOM] Teacher not found: ${payload.organizer.email}`);
    return;
  }

  // Create session + booking in a transaction
  await db.transaction(async (tx) => {
    const [session] = await tx.insert(sessions).values({
      orgId,
      teacherId: teacher.id,
      type: sessionType as typeof sessions.type.enumValues[number],
      status: "SCHEDULED",
      title: payload.title,
      scheduledStart: new Date(payload.startTime),
      scheduledEnd: new Date(payload.endTime),
      calcomEventId: String(payload.id),
    }).returning();

    await tx.insert(bookings).values({
      orgId,
      userId,
      sessionId: session.id,
      status: "CONFIRMED",
      calcomBookingId: String(payload.id),
    });
  });
}

/** Cancels a booking when Cal.com booking is cancelled */
async function handleBookingCancelled(event: CalcomWebhookPayload) {
  const calcomBookingId = String(event.payload.id);

  // Update all bookings with this calcom ID
  await db
    .update(bookings)
    .set({ status: "CANCELLED", cancelledAt: new Date() })
    .where(eq(bookings.calcomBookingId, calcomBookingId));

  // Find affected sessions
  const affectedBookings = await db
    .select({ sessionId: bookings.sessionId })
    .from(bookings)
    .where(eq(bookings.calcomBookingId, calcomBookingId));

  for (const b of affectedBookings) {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.sessionId, b.sessionId), eq(bookings.status, "CONFIRMED")));

    if ((result?.count ?? 0) === 0) {
      await db
        .update(sessions)
        .set({ status: "CANCELLED" })
        .where(eq(sessions.id, b.sessionId));
    }
  }
}

/** Handles rescheduled bookings by updating session times */
async function handleBookingRescheduled(event: CalcomWebhookPayload) {
  const calcomBookingId = String(event.payload.id);

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.calcomBookingId, calcomBookingId),
  });

  if (booking) {
    await db
      .update(sessions)
      .set({
        scheduledStart: new Date(event.payload.startTime),
        scheduledEnd: new Date(event.payload.endTime),
      })
      .where(eq(sessions.id, booking.sessionId));
  }
}
