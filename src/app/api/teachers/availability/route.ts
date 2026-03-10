import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { teacherAvailability } from "@/db/schema";
import { NextResponse } from "next/server";

export async function GET() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const availability = await db.query.teacherAvailability.findMany({
    where: eq(teacherAvailability.teacherId, session.user.id),
  });

  return NextResponse.json(availability);
}

export async function POST(req: Request) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slots } = await req.json(); // Array of { dayOfWeek: number, startTime: string, endTime: string }

  const user = session.user as { id: string; orgId: string };

  try {
    // 1. Delete existing for simplicity in this bulk update
    await db.delete(teacherAvailability).where(eq(teacherAvailability.teacherId, user.id));

    // 2. Insert new slots
    if (slots.length > 0) {
      await db.insert(teacherAvailability).values(
        slots.map((s: any) => ({
          teacherId: user.id,
          orgId: user.orgId,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          isRecurring: true,
        }))
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save availability:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
