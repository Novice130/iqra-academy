import { NextRequest, NextResponse } from "next/server";
import { verifyRealtimeTicket, getRealtimeSecret } from "@/lib/realtime/ticket";

export const dynamic = "force-dynamic";

/**
 * The realtime WebSocket does not live in Next: a route handler cannot answer
 * 101 Switching Protocols. In production the reverse proxy sends this exact
 * path to the realtime sidecar (src/realtime/server), so this handler is only
 * reached where there is no proxy in front — `next dev`, tests — and all it
 * can honestly do is validate the ticket and say where the socket is.
 */
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

  if (request.headers.get("Upgrade") !== "websocket") {
    return NextResponse.json({
      status: "ready",
      orgId: claims.orgId,
      userId: claims.userId,
      notice: "Realtime WebSocket endpoint active; requires WebSocket upgrade header.",
    });
  }

  return new Response(
    "WebSocket upgrades are served by the realtime sidecar, not by Next. Route /api/realtime/ws to it at the proxy.",
    { status: 501 }
  );
}
