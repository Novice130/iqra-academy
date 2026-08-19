/**
 * @fileoverview One place that tells somebody something.
 *
 * WHY THIS EXISTS: before this file, "tell the student the class started" was
 * written out longhand inside api/teachers/instant-meeting — insert a
 * notifications row, then call sendPushToUsers, with the message text
 * duplicated between them. Every new thing worth announcing would have copied
 * that block again, and the day we move from email to WhatsApp we would have
 * had to find every copy.
 *
 * So: one call, three transports.
 *
 *   - **in-app**  a `notifications` row, polled by /api/notifications/unread.
 *                 Reaches somebody who has the site open. Nothing else.
 *   - **push**    FCM, via lib/fcm.ts. Reaches the phone in their pocket, but
 *                 only if they installed the app and granted permission.
 *   - **email**   Resend, via lib/email.ts. Reaches them eventually, and is
 *                 the only one that still works a day later.
 *
 * None of the three is reliable alone, which is why the default is all three.
 *
 * FAILURE POLICY: every transport is caught separately and never rethrows. A
 * Resend outage must not roll back a booking the student already believes they
 * made — the class existing matters more than the announcement arriving. This
 * matches the swallow-and-log convention already in lib/email.ts.
 *
 * PRICES: `body` goes into the in-app row and the push payload, both of which
 * families see inside the app. Never put a dollar amount in it. Amounts belong
 * in `emailHtml` only — see lib/pricing-visibility.ts for why.
 *
 * @module lib/notify
 */

import { db } from "./db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { notifications, users } from "@/db/schema";
import { sendPushToUsers } from "./fcm";
import { sendRawEmail } from "./email";
import { createId } from "@paralleldrive/cuid2";

type NotificationType = (typeof notifications.type.enumValues)[number];

export type NotifyChannel = "inapp" | "push" | "email";

const ALL_CHANNELS: NotifyChannel[] = ["inapp", "push", "email"];

export interface NotifyOptions {
  orgId: string;
  /** Recipients who have accounts — they get the in-app row and the push. */
  userIds?: string[];
  /** Extra bare addresses, e.g. the admin inbox. Email only. */
  emails?: string[];
  type: NotificationType;
  /** Email subject, and the push title. Short. */
  title: string;
  /** The in-app message and the push body. No money figures. */
  body: string;
  /** Full email body. Falls back to a plain rendering of `body`. */
  emailHtml?: string;
  /** Where tapping the notification should land. */
  path?: string;
  sessionId?: string;
  /** Defaults to all three. */
  channels?: NotifyChannel[];
}

/**
 * The staff who should hear about anything a family does.
 *
 * Resolved by role rather than hardcoded, because a hardcoded address goes
 * stale the moment a second admin exists. NOTIFY_ADMIN_EMAIL is an override
 * for the case where the owner wants the mail somewhere other than the
 * address they log in with.
 */
export async function getAdminRecipients(
  orgId: string
): Promise<{ userIds: string[]; emails: string[] }> {
  try {
    const admins = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.orgId, orgId),
          inArray(users.role, ["ORG_ADMIN", "SUPER_ADMIN"]),
          isNull(users.deletedAt)
        )
      );

    const override = process.env.NOTIFY_ADMIN_EMAIL;
    const emails = admins.map((a) => a.email).filter(Boolean);
    if (override && !emails.includes(override)) emails.push(override);

    return { userIds: admins.map((a) => a.id), emails };
  } catch (error) {
    console.error("[notify] could not resolve admin recipients", error);
    // Better to mail the fallback address than to tell nobody.
    const fallback = process.env.NOTIFY_ADMIN_EMAIL;
    return { userIds: [], emails: fallback ? [fallback] : [] };
  }
}

/** Wrap a plain message in the same shell the other emails use. */
function defaultHtml(title: string, body: string, url?: string): string {
  const button = url
    ? `<div style="text-align:center;margin:28px 0;">
         <a href="${url}" style="background:#1a5f3a;color:#fff;padding:13px 26px;
            text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold;">
           Open Novice Tutor
         </a>
       </div>`
    : "";
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#1a5f3a;">${title}</h2>
      <p style="font-size:16px;line-height:1.6;color:#333;">${body}</p>
      ${button}
    </div>
  `;
}

/**
 * Announce something on every channel asked for.
 *
 * Resolves once all transports have settled. Never throws.
 */
export async function notify(opts: NotifyOptions): Promise<void> {
  const channels = opts.channels ?? ALL_CHANNELS;
  const userIds = [...new Set(opts.userIds ?? [])];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com";
  const url = opts.path ? `${appUrl}${opts.path}` : undefined;

  const work: Promise<unknown>[] = [];

  if (channels.includes("inapp") && userIds.length > 0) {
    work.push(
      db
        .insert(notifications)
        .values(
          userIds.map((userId) => ({
            id: createId(),
            orgId: opts.orgId,
            userId,
            type: opts.type,
            sessionId: opts.sessionId ?? null,
            message: opts.body,
          }))
        )
        .catch((error) => console.error("[notify] in-app insert failed", error))
    );
  }

  if (channels.includes("push") && userIds.length > 0) {
    work.push(
      sendPushToUsers(userIds, {
        title: opts.title,
        body: opts.body,
        path: opts.path,
        sessionId: opts.sessionId,
      }).catch((error) => console.error("[notify] push failed", error))
    );
  }

  if (channels.includes("email")) {
    work.push(
      (async () => {
        const addresses = [...(opts.emails ?? [])];

        // Account holders get the email too — look up the addresses we do not
        // already have. A missing row here must not stop the send to the ones
        // passed in explicitly.
        if (userIds.length > 0) {
          try {
            const rows = await db
              .select({ email: users.email })
              .from(users)
              .where(and(inArray(users.id, userIds), isNull(users.deletedAt)));
            for (const r of rows) if (r.email) addresses.push(r.email);
          } catch (error) {
            console.error("[notify] recipient lookup failed", error);
          }
        }

        const unique = [...new Set(addresses.filter(Boolean))];
        if (unique.length === 0) return;

        await sendRawEmail({
          to: unique,
          subject: opts.title,
          html: opts.emailHtml ?? defaultHtml(opts.title, opts.body, url),
        });
      })()
    );
  }

  await Promise.allSettled(work);
}
