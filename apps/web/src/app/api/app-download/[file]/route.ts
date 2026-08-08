/**
 * @fileoverview Android APK downloads, streamed from R2.
 *
 * RBAC: none — this is the public download page's file.
 * GET /api/app-download/novice-tutor.apk
 *
 * The APKs used to sit in `public/app/` and go out as Workers static assets.
 * That stopped working when screen sharing pulled WebRTC's native libraries
 * into the build: arm64 went from 18.9 MB to 32.1 MB and a single static
 * asset is capped at 25 MiB, so `deploy:cf` failed outright with
 * `Error: Asset too large.` — the whole deploy, not just the file.
 *
 * The object's body is handed to the Response untouched. It is never read
 * into a Buffer and never base64'd: this worker has 128 MB of memory and
 * materialising a 32 MB file to send it is how the August 1102 outages
 * happened in the first place.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Only these. The name is a path segment, so nothing else may be reachable. */
const ALLOWED = new Set(["novice-tutor.apk", "novice-tutor-arm32.apk"]);

/**
 * Just enough of R2's shape to stream an object out.
 *
 * Written by hand rather than pulling in `@cloudflare/workers-types`, whose
 * global declarations collide with the DOM lib this app is compiled against —
 * it would trade one missing type for a pile of duplicate ones.
 */
interface AppDownloadsBucket {
  get(key: string): Promise<{
    body: ReadableStream | null;
    size: number;
    httpEtag: string;
  } | null>;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!ALLOWED.has(file)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  const bucket = (env as unknown as { APP_DOWNLOADS?: AppDownloadsBucket }).APP_DOWNLOADS;
  if (!bucket) {
    return NextResponse.json({ error: "Downloads are not configured." }, { status: 503 });
  }

  const object = await bucket.get(file);
  if (!object) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": String(object.size),
      // Without this the browser saves it under the route's last segment,
      // which happens to be right here but would not survive a rename.
      "Content-Disposition": `attachment; filename="${file}"`,
      "ETag": object.httpEtag,
      // A build is immutable — a new one gets a new upload, not an edit —
      // but an hour keeps a bad push from being cached for a day.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
