/**
 * @fileoverview App downloads, streamed from disk.
 *
 * RBAC: none — this is the public download page's file.
 * GET /api/app-download/novice-tutor.apk
 *
 * The builds sit in `APP_DOWNLOADS_DIR`, a volume on the server, rather than
 * in `public/`: they are published by copying a file onto the box, and
 * anything in `public/` is frozen into the image at build time.
 *
 * The file is piped to the Response as a stream. It is never read into a
 * Buffer: an installer is tens of megabytes, and holding one in memory per
 * concurrent download is an easy way to run a small box out of it.
 */

import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { DOWNLOAD_CONTENT_TYPES, findDownload, type DownloadFile } from "@/lib/app-downloads";

/** Served from the filesystem, so never the edge runtime. */
export const runtime = "nodejs";
/** What is on disk changes without a deploy; nothing here may be cached at build. */
export const dynamic = "force-dynamic";

function downloadHeaders(file: string, found: DownloadFile): Record<string, string> {
  return {
    // Was hardcoded to the APK type, which would have handed a Windows
    // installer to the browser labelled as an Android package.
    "Content-Type":
      DOWNLOAD_CONTENT_TYPES[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream",
    "Content-Length": String(found.size),
    // Without this the browser saves it under the route's last segment,
    // which happens to be right here but would not survive a rename.
    "Content-Disposition": `attachment; filename="${file}"`,
    // Size and mtime, not a content hash: hashing would mean reading the
    // whole file on every request to say whether it had changed.
    "ETag": `"${found.size.toString(16)}-${Math.floor(found.mtimeMs).toString(16)}"`,
    // A build is immutable — a new one gets a new upload, not an edit —
    // but an hour keeps a bad push from being cached for a day.
    "Cache-Control": "public, max-age=3600",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const found = await findDownload(file);
  if (!found) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const headers = downloadHeaders(file, found);
  if (request.headers.get("if-none-match") === headers.ETag) {
    return new Response(null, { status: 304, headers });
  }

  // `end` pins the read to the size already announced: a build replaced
  // mid-download must not send more bytes than Content-Length promised.
  const stream = createReadStream(found.path, { end: Math.max(found.size - 1, 0) });
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, { headers });
}

export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const found = await findDownload(file);
  if (!found) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, { headers: downloadHeaders(file, found) });
}
