/**
 * @fileoverview Open slots a student can actually book.
 *
 * RBAC: any authenticated user.
 * GET /api/availability/slots?teacherId=&days=14
 *
 * Returns **absolute instants as ISO strings**, never formatted times. The
 * viewer's clock is the browser's business (see docs/timezones.md and
 * components/LocalTime.tsx); a server on a Worker runs in UTC and formatting
 * here is how a 6:00 PM class became 11:00 PM for everyone once already.
 *
 * `teacherTimeZone` rides along so the booking screen can show the teacher's
 * own hour beside the student's — "7:30 AM your time · 6:00 PM for your
 * teacher". That is a trust signal and a canary for a mis-entered teacher
 * zone, not a guard: with availability entered correctly, a slot that is 3 AM
 * for the teacher cannot be generated in the first place.
 */

import { NextRequest, NextResponse } from "next/server";
import { withHttpDb } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { generateSlots } from "@/lib/slots";

export async function GET(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { searchParams } = new URL(request.url);
      const teacherId = searchParams.get("teacherId") || undefined;
      const days = Math.min(Math.max(Number(searchParams.get("days") ?? 14) || 14, 1), 28);

      const slots = await generateSlots({
        orgId: ctx.orgId,
        teacherId,
        to: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      });

      return NextResponse.json({
        slots: slots.map((s) => ({
          teacherId: s.teacherId,
          teacherName: s.teacherName,
          teacherTimeZone: s.teacherTimeZone,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
        })),
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
