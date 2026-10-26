/**
 * @fileoverview POST /api/cron/daily — the once-a-day billing sweep
 * (lib/daily-jobs.ts): overdue invoices and manual subscriptions at period end.
 *
 * Called by a systemd timer on the Hetzner server, from inside the web
 * container, so the request never leaves the box:
 *
 *   docker exec novicetutor-web-1 node -e "fetch('http://127.0.0.1:3000/api/cron/daily',
 *     {method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}})
 *     .then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, compared in constant time.
 * Fail-closed: with CRON_SECRET unset the route answers 503 and does nothing.
 * Its own secret rather than REALTIME_SECRET, so the realtime sidecar, which
 * holds that one, cannot trigger billing emails.
 *
 * Safe to run more than once a day, or twice at once: every step only acts
 * on rows still in the state it is looking for.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db";
import { isServiceAuthorized } from "@/lib/realtime/ticket";
import { runDailyJobs } from "@/lib/daily-jobs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
    }
    if (!isServiceAuthorized(request.headers.get("Authorization"), secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const result = await runDailyJobs();
      console.log("[cron/daily]", JSON.stringify(result));
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      console.error("[cron/daily] failed", err);
      return NextResponse.json({ error: "Daily job failed" }, { status: 500 });
    }
  });
}
