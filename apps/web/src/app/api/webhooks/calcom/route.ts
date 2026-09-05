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
import { db, withDb } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";
import { users, sessions, bookings } from "@/db/schema";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";
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

  return withDb(async () => {
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
  });
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

  // Webhook retries re-deliver the same booking id: without this check every
  // retry mints a duplicate session. Booking id is the dedup key (unique
  // index bookings_calcom_booking_id_unique); event ids are Cal.com's
  // internal routing key and carry no uniqueness promise, so they stay
  // plain columns by design (see AI2-reviews Phase 2, hole 3 waiver).
  const calcomBookingId = String(payload.id);
  const already = await db.query.bookings.findFirst({
    where: eq(bookings.calcomBookingId, calcomBookingId),
    columns: { id: true },
  });
  if (already) return;

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
  const created = await db.transaction(async (tx) => {
    const [session] = await tx.insert(sessions).values({
      orgId,
      teacherId: teacher.id,
      type: sessionType as typeof sessions.type.enumValues[number],
      origin: "WEBHOOK",
      status: "SCHEDULED",
      title: payload.title,
      scheduledStart: new Date(payload.startTime),
      scheduledEnd: new Date(payload.endTime),
      calcomEventId: String(payload.id),
    }).returning();

    const [booking] = await tx.insert(bookings).values({
      orgId,
      userId,
      sessionId: session.id,
      status: "CONFIRMED",
      calcomBookingId: String(payload.id),
    }).returning({ id: bookings.id });

    await insertSchedulingEvent(tx, {
      orgId,
      teacherId: teacher.id,
      actorId: userId,
      type: "session.changed",
      aggregateType: "session",
      aggregateId: session.id,
    });
    await insertSchedulingEvent(tx, {
      orgId,
      teacherId: teacher.id,
      actorId: userId,
      type: "booking.created",
      aggregateType: "booking",
      aggregateId: booking.id,
    });
    const result = { orgId, teacherId: teacher.id, sessionId: session.id, bookingId: booking.id };
    return result;
  });
  if (created) {
    const c = created;
    afterResponse(drainOutbox({ orgId: c.orgId }).catch(() => {}));
  }
}

/** Cancels a booking when Cal.com booking is cancelled */
async function handleBookingCancelled(event: CalcomWebhookPayload) {
  const calcomBookingId = String(event.payload.id);

  const cancelled = await db
    .update(bookings)
    .set({ status: "CANCELLED", cancelledAt: new Date() })
    .where(eq(bookings.calcomBookingId, calcomBookingId))
    .returning({ id: bookings.id, orgId: bookings.orgId, sessionId: bookings.sessionId });

  // Find affected sessions
  const affectedBookings = await db
    .select({ sessionId: bookings.sessionId })
    .from(bookings)
    .where(eq(bookings.calcomBookingId, calcomBookingId));

  const sessionEvents: { orgId: string; teacherId: string; sessionId: string }[] = [];
  for (const b of affectedBookings) {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.sessionId, b.sessionId), eq(bookings.status, "CONFIRMED")));

    if ((result?.count ?? 0) === 0) {
      const [session] = await db
        .update(sessions)
        .set({ status: "CANCELLED" })
        .where(eq(sessions.id, b.sessionId))
        .returning({ id: sessions.id, orgId: sessions.orgId, teacherId: sessions.teacherId });
      if (session) {
        sessionEvents.push({ orgId: session.orgId, teacherId: session.teacherId, sessionId: session.id });
      }
    }
  }

  // Outbox rows own the realtime fan-out; one transaction per aggregate keeps
  // the cancel visible even when nothing else in the webhook mutates.
  const byOrg = new Map<string, { orgId: string; teacherId: string; bookingIds: string[]; sessionIds: string[] }>();
  for (const b of cancelled) {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, b.sessionId),
      columns: { teacherId: true },
    });
    if (!session) continue;
    const entry = byOrg.get(b.orgId) ?? { orgId: b.orgId, teacherId: session.teacherId, bookingIds: [], sessionIds: [] };
    entry.bookingIds.push(b.id);
    byOrg.set(b.orgId, entry);
  }
  for (const s of sessionEvents) {
    const entry = byOrg.get(s.orgId) ?? { orgId: s.orgId, teacherId: s.teacherId, bookingIds: [], sessionIds: [] };
    entry.sessionIds.push(s.sessionId);
    byOrg.set(s.orgId, entry);
  }
  for (const entry of byOrg.values()) {
    await db.transaction(async (tx) => {
      for (const bookingId of entry.bookingIds) {
        await insertSchedulingEvent(tx, {
          orgId: entry.orgId,
          teacherId: entry.teacherId,
          actorId: entry.teacherId,
          type: "booking.cancelled",
          aggregateType: "booking",
          aggregateId: bookingId,
        });
      }
      for (const sessionId of entry.sessionIds) {
        await insertSchedulingEvent(tx, {
          orgId: entry.orgId,
          teacherId: entry.teacherId,
          actorId: entry.teacherId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: sessionId,
        });
      }
    });
    afterResponse(drainOutbox({ orgId: entry.orgId }).catch(() => {}));
  }
}

/** Handles rescheduled bookings by updating session times */
async function handleBookingRescheduled(event: CalcomWebhookPayload) {
  const calcomBookingId = String(event.payload.id);

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.calcomBookingId, calcomBookingId),
  });

  if (booking) {
    const [session] = await db
      .update(sessions)
      .set({
        scheduledStart: new Date(event.payload.startTime),
        scheduledEnd: new Date(event.payload.endTime),
      })
      .where(eq(sessions.id, booking.sessionId))
      .returning({ id: sessions.id, orgId: sessions.orgId, teacherId: sessions.teacherId });
    if (session) {
      await db.transaction(async (tx) => {
        await insertSchedulingEvent(tx, {
          orgId: session.orgId,
          teacherId: session.teacherId,
          actorId: session.teacherId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: session.id,
        });
      });
      afterResponse(drainOutbox({ orgId: session.orgId }).catch(() => {}));
    }
  }
}
