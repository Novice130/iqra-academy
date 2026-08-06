/**
 * @fileoverview Device registration for the mobile shell app.
 *
 * RBAC: any authenticated user, for their own devices only.
 * POST   /api/devices — { token, platform? } — register/refresh an FCM token
 * DELETE /api/devices — { token } — deregister (sign-out on the device)
 *
 * The mobile app is a WebView around this site, so it registers by calling
 * this endpoint from inside the page — the Better Auth session cookie is
 * already attached and there is no second auth path to maintain. A 401 here
 * just means nobody is signed in on that device yet; the app retries on the
 * next page load.
 *
 * FCM hands out one token per app install, and that token can move between
 * users (reinstall, restored backup, a shared handset). The token is therefore
 * unique and the most recent registration wins ownership — otherwise a class
 * starting for one student would ring on another's phone.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { deviceTokens } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, BusinessRuleError } from "@/lib/errors";

const PLATFORMS = new Set(["android", "ios"]);

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;

      const body = await request.json().catch(() => ({}));
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      const platform =
        typeof body?.platform === "string" ? body.platform.toLowerCase() : "android";

      if (!token) throw new BusinessRuleError("token is required");
      if (!PLATFORMS.has(platform)) {
        throw new BusinessRuleError(`Unknown platform "${platform}"`);
      }

      await db
        .insert(deviceTokens)
        .values({ userId: authResult.userId, token, platform })
        .onConflictDoUpdate({
          target: deviceTokens.token,
          set: { userId: authResult.userId, platform, lastSeenAt: new Date() },
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
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      if (!token) throw new BusinessRuleError("token is required");

      // Scoped to the caller: a token you do not own is not yours to delete.
      await db
        .delete(deviceTokens)
        .where(
          and(eq(deviceTokens.token, token), eq(deviceTokens.userId, authResult.userId))
        );

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
