import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { getRealtimeSecret } from "@/lib/realtime/ticket";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    let secret: string;
    try {
      secret = getRealtimeSecret();
    } catch {
      return NextResponse.json({ error: "Realtime is not configured." }, { status: 503 });
    }
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId") || undefined;
    const limitParam = searchParams.get("limit");
    let limit: number | undefined;
    if (limitParam !== null) {
      const parsed = Number(limitParam);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
        return NextResponse.json(
          { error: "Invalid limit: must be an integer between 1 and 500." },
          { status: 400 }
        );
      }
      limit = parsed;
    }

    try {
      const result = await drainOutbox({ orgId, limit });
      if (result.deadLettered.length > 0) {
        console.error(
          `[Realtime Outbox] Dead-lettered ${result.deadLettered.length} event(s): ${result.deadLettered.join(", ")}`
        );
      }
      return NextResponse.json({ success: true, ...result });
    } catch (err: any) {
      console.error("[drain-outbox API error]", err);
      return NextResponse.json(
        { error: err?.message || "Failed to drain outbox" },
        { status: 500 }
      );
    }
  });
}
