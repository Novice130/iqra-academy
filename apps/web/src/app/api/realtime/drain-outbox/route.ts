import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    const authHeader = request.headers.get("Authorization");
    const secret = process.env.REALTIME_SECRET || "novicetutor-realtime-secret";
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    try {
      const result = await drainOutbox({ orgId, limit });
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
