/**
 * @fileoverview Browser push subscriptions — the desktop half of ringing.
 *
 * RBAC: any authenticated user, for their own browser only.
 * POST   /api/push/subscribe — register (or re-point) a subscription
 * DELETE /api/push/subscribe — drop it (user turned notifications off)
 *
 * The endpoint URL is the identity of a browser instance, so it is the unique
 * key. Like FCM tokens, one can move between users on a shared computer —
 * whoever registered last owns it, otherwise a class starting for one student
 * would notify another on the same machine.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, BusinessRuleError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;

      const body = await request.json().catch(() => ({}));
      const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
      const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
      const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";

      if (!endpoint) throw new BusinessRuleError("endpoint is required");

      await db
        .insert(pushSubscriptions)
        .values({
          userId: authResult.userId,
          endpoint,
          // Stored for completeness. Our pushes carry no payload, so these are
          // never used to encrypt anything today — see src/lib/webpush.ts.
          p256dh,
          auth,
          platform: "WEB",
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { userId: authResult.userId, p256dh, auth },
        });

      return NextResponse.json({ success: true });
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

      const body = await request.json().catch(() => ({}));
      const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
      if (!endpoint) throw new BusinessRuleError("endpoint is required");

      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
