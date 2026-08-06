/**
 * @fileoverview Viewer's own time zone.
 *
 * RBAC: any authenticated user, for their own row only.
 * GET   /api/me/timezone — { timezone: string | null }
 * PATCH /api/me/timezone — { timezone: string | null }
 *
 * Class times are stored as absolute instants and rendered in the viewer's
 * zone. Reading that zone off the browser is right until the device is wrong,
 * and devices are wrong often enough to matter: a student in Illinois on a
 * phone still set to India time was shown their teacher's 4:30 AM. Null here
 * means "keep trusting the browser".
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, BusinessRuleError, NotFoundError } from "@/lib/errors";

/** Does the runtime's own IANA database recognise this zone? */
function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;

      const user = await db.query.users.findFirst({
        where: eq(users.id, authResult.userId),
        columns: { timezone: true },
      });
      if (!user) throw new NotFoundError("User");

      return NextResponse.json({ timezone: user.timezone ?? null });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function PATCH(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;

      const body = await request.json().catch(() => ({}));
      const raw = body?.timezone;

      // Explicit null clears it and hands the decision back to the browser.
      if (raw !== null && typeof raw !== "string") {
        throw new BusinessRuleError("timezone must be an IANA zone name or null");
      }
      const timezone = raw === null || raw === "" ? null : raw.trim();
      if (timezone && !isValidZone(timezone)) {
        throw new BusinessRuleError(`"${timezone}" is not a time zone this server recognises.`);
      }

      await db.update(users).set({ timezone }).where(eq(users.id, authResult.userId));

      return NextResponse.json({ success: true, timezone });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
