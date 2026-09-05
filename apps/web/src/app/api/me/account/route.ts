/**
 * @fileoverview Deleting your own account.
 *
 * RBAC: any signed-in user, for their own row only.
 * DELETE /api/me/account — { confirm: "DELETE" }
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * App Store Review Guideline 5.1.1(v): an app that lets people create an
 * account must let them delete it from inside the app. Not an email address to
 * write to — a control they can reach. The iOS build cannot be submitted
 * without it, and until now the only way out of this school's records was to
 * ask somebody to run SQL.
 *
 * Staff cannot delete themselves here, and that is not a gap in the guideline:
 * teacher and admin accounts are not created in the app. Somebody signs up as
 * a family and an admin promotes them (api/admin/users), so the account a
 * person created is a student account, and that is the one this route removes.
 * A teacher deleting themselves mid-term would also cancel other people's
 * classes, which is a decision for the school rather than a button.
 *
 * ── Soft delete, hard erase ─────────────────────────────────────────────────
 * The row survives; the person does not. Attendance, invoices, progress
 * records and audit logs all carry this user id, and deleting the row means
 * either a foreign key error or a cascade that takes the school's books with
 * it. So the identifying columns are overwritten — name, email, phone, image,
 * and the children's names — and `deletedAt` is stamped, which is already the
 * filter every listing query uses. What is left is a shape in the history with
 * no name on it.
 *
 * Unpaid invoices stay readable, deliberately. A debt is not erased by
 * closing the account it was raised against, and an admin looking at the
 * ledger needs to see that something is owed even when they can no longer see
 * by whom.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withDb, withRLS } from "@/lib/db";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  accounts,
  authSessions,
  bookings,
  deviceTokens,
  pushSubscriptions,
  sessions,
  studentProfiles,
  subscriptions,
  users,
} from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";
import { notify, getAdminRecipients } from "@/lib/notify";

const schema = z.object({
  /**
   * The word, typed. A DELETE with an empty body is one stray fetch away from
   * wiping an account, and this is the only action in the app with no undo.
   */
  confirm: z.literal("DELETE"),
});

/**
 * GET /api/me/account — who am I, and may I delete this?
 *
 * The settings page is a client component and Better Auth's session carries
 * no role (the auth config sets no `additionalFields`), so the one fact the
 * delete card needs has to come from somewhere. Here, rather than widening
 * the session: the answer is also the same rule the DELETE below enforces,
 * and two copies of an authorisation rule drift.
 */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const isRootAdmin = ctx.email?.toLowerCase() === "syedamer130@gmail.com";

      return NextResponse.json({
        role: ctx.role,
        email: ctx.email,
        isProtected: isRootAdmin,
        canDelete: ctx.role === "STUDENT" && !ctx.isImpersonating && !isRootAdmin,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      schema.parse(await request.json().catch(() => ({})));

      if (ctx.email?.toLowerCase() === "syedamer130@gmail.com") {
        throw new ForbiddenError(
          "The root administrator account (syedamer130@gmail.com) is permanently protected and cannot be deleted."
        );
      }
      if (ctx.isImpersonating) {
        throw new ForbiddenError(
          "You're impersonating this user. Stop impersonating before deleting anything."
        );
      }
      if (ctx.role !== "STUDENT") {
        throw new ForbiddenError(
          "Staff accounts are removed by the school, not from here. Ask an admin."
        );
      }

      const result = await withRLS(ctx, async (tx) => {
        const me = await tx.query.users.findFirst({
          where: and(eq(users.id, ctx.userId), isNull(users.deletedAt)),
          columns: { id: true, name: true, email: true, orgId: true },
        });
        if (!me) throw new NotFoundError("User");

        const now = new Date();

        // 1. Classes still to come. Cancelled rather than left standing: a
        //    teacher should not be sitting in a room at 6pm for somebody who
        //    closed their account on Tuesday.
        const upcoming = await tx
          .select({ id: bookings.id, sessionId: bookings.sessionId })
          .from(bookings)
          .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
          .where(
            and(
              eq(bookings.userId, me.id),
              ne(bookings.status, "CANCELLED"),
              gt(sessions.scheduledStart, now)
            )
          );

        const cancelledBookings: { id: string }[] = [];
        if (upcoming.length > 0) {
          const cancelled = await tx
            .update(bookings)
            .set({ status: "CANCELLED", cancelledAt: now })
            .where(inArray(bookings.id, upcoming.map((b) => b.id)))
            .returning({ id: bookings.id });
          cancelledBookings.push(...cancelled);

          // 2. A class nobody is left booked on is cancelled too. The "is
          //    anybody else on it" test is a NOT EXISTS inside the same
          //    statement rather than a query and then an update, because
          //    between those two another family could book the slot.
          const sessionIds = [...new Set(upcoming.map((b) => b.sessionId))];
          await tx
            .update(sessions)
            .set({ status: "CANCELLED" })
            .where(
              and(
                inArray(sessions.id, sessionIds),
                eq(sessions.status, "SCHEDULED"),
                sql`NOT EXISTS (
                  SELECT 1 FROM bookings
                  WHERE bookings.session_id = sessions.id
                    AND bookings.status <> 'CANCELLED'
                )`
              )
            );
        }

        // 3. Stop the billing relationship. The invoices already raised stay.
        await tx
          .update(subscriptions)
          .set({ status: "CANCELLED", cancelAtPeriodEnd: true })
          .where(
            and(
              eq(subscriptions.userId, me.id),
              inArray(subscriptions.status, ["ACTIVE", "PAST_DUE", "UNPAID", "TRIALING", "PAUSED"])
            )
          );

        // 4. The children's names are personal data too.
        await tx
          .update(studentProfiles)
          .set({ name: "Removed", notes: null, dateOfBirth: null })
          .where(eq(studentProfiles.userId, me.id));

        for (const b of cancelledBookings) {
          const session = await tx.query.sessions.findFirst({
            where: eq(sessions.id, upcoming.find((u) => u.id === b.id)!.sessionId),
            columns: { teacherId: true },
          });
          if (session) {
            await insertSchedulingEvent(tx, {
              orgId: me.orgId,
              teacherId: session.teacherId,
              actorId: me.id,
              type: "booking.cancelled",
              aggregateType: "booking",
              aggregateId: b.id,
            });
          }
        }

        // 5. The account itself. The email has to stay unique — it is half of
        //    a unique index with the org — so the id goes in it, and
        //    `.invalid` is the TLD reserved by RFC 2606 precisely so that
        //    nothing will ever try to deliver mail to it.
        await tx
          .update(users)
          .set({
            name: "Deleted account",
            email: `deleted+${me.id}@novicetutor.invalid`,
            emailVerified: false,
            phone: null,
            image: null,
            deletedAt: now,
          })
          .where(eq(users.id, me.id));

        // 6. Anything that could still reach them, or let them back in.
        await tx.delete(deviceTokens).where(eq(deviceTokens.userId, me.id));
        await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, me.id));
        await tx.delete(accounts).where(eq(accounts.userId, me.id));
        await tx.delete(authSessions).where(eq(authSessions.userId, me.id));

        return { me, orgId: me.orgId, cancelledClasses: upcoming.length };
      });

      if (result.cancelledClasses > 0) {
        afterResponse(drainOutbox({ orgId: result.orgId }).catch(() => {}));
      }

      await logAudit({
        orgId: result.me.orgId,
        actorId: result.me.id,
        action: "USER_DELETED",
        target: `user:${result.me.id}`,
        metadata: {
          selfService: true,
          cancelledBookings: result.cancelledClasses,
          // Kept here on purpose: the audit log is the school's record that
          // this particular family left, and it is the one place the name is
          // allowed to survive the deletion.
          email: result.me.email,
        },
        ipAddress: getClientIp(request.headers),
      });

      // The school hears about it, or a teacher finds out by turning up to an
      // empty class. Email only — there is no in-app row to write against a
      // user who no longer exists.
      const admins = await getAdminRecipients(result.me.orgId);
      await notify({
        orgId: result.me.orgId,
        emails: admins.emails,
        type: "ROLE_GRANTED",
        title: "A family deleted their account",
        body: `${result.me.name} (${result.me.email}) deleted their Novice Tutor account. ${result.cancelledClasses} upcoming class${result.cancelledClasses === 1 ? "" : "es"} cancelled.`,
        channels: ["email"],
      });

      return NextResponse.json({ deleted: true, cancelledClasses: result.cancelledClasses });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
