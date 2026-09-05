import { NextRequest, NextResponse } from "next/server";
import { verifyRealtimeTicket, getRealtimeSecret } from "@/lib/realtime/ticket";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticket = searchParams.get("ticket");

  if (!ticket) {
    return NextResponse.json({ error: "Missing realtime ticket" }, { status: 401 });
  }

  let secret: string;
  try {
    secret = getRealtimeSecret();
  } catch {
    return NextResponse.json({ error: "Realtime is not configured." }, { status: 503 });
  }
  let claims;
  try {
    claims = await verifyRealtimeTicket(ticket, secret);
  } catch {
    return NextResponse.json({ error: "Invalid or expired realtime ticket" }, { status: 401 });
  }

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const cf = getCloudflareContext();
    const hubNamespace = (cf?.env as any)?.AVAILABILITY_HUB;

    if (hubNamespace && typeof hubNamespace.idFromName === "function") {
      const doId = hubNamespace.idFromName(claims.orgId);
      const stub = hubNamespace.get(doId);
      // Forward the original request with WebSocket upgrade headers to the partitioned DO
      return stub.fetch(request as unknown as Request);
    }
  } catch {
    // Expected outside of Cloudflare Workers runtime
  }

  // Fallback for non-Cloudflare environments (Next.js dev/testing)
  if (request.headers.get("Upgrade") !== "websocket") {
    return NextResponse.json({
      status: "ready",
      orgId: claims.orgId,
      userId: claims.userId,
      notice: "Realtime WebSocket endpoint active; requires WebSocket upgrade header.",
    });
  }

  return new Response("WebSocket connection requires Cloudflare Durable Objects environment.", {
    status: 501,
  });
}
