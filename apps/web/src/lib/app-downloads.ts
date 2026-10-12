/**
 * The installable builds, by platform.
 *
 * Shared by the download page and the route that streams the files. It lives
 * here rather than in the route because a Next route module may only export
 * handlers — exporting a constant from one fails the build with a type error
 * about the index signature, which is not an obvious way to be told that.
 *
 * A key here does not mean the file exists. The desktop builds are produced
 * on a Windows machine and copied to the server by hand, so the page asks the
 * disk what is actually there before offering a link.
 *
 * The files live in `APP_DOWNLOADS_DIR` — a volume mounted into the container,
 * outside the image, so publishing a build is a copy onto the box and not a
 * deploy.
 */
import { stat } from "node:fs/promises";
import path from "node:path";

export const ALLOWED_DOWNLOADS = {
  androidArm64: "novice-tutor.apk",
  androidArm32: "novice-tutor-arm32.apk",
  windows: "novice-tutor-setup.exe",
  macos: "novice-tutor.dmg",
} as const;

export type DownloadKey = (typeof ALLOWED_DOWNLOADS)[keyof typeof ALLOWED_DOWNLOADS];

/** Content types by extension — a file on disk carries none of its own. */
export const DOWNLOAD_CONTENT_TYPES: Record<string, string> = {
  ".apk": "application/vnd.android.package-archive",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".dmg": "application/x-apple-diskimage",
};

const ALLOWED = new Set<string>(Object.values(ALLOWED_DOWNLOADS));

/** Where the builds are kept. Read per call so a test can point it elsewhere. */
export function downloadsDir(): string {
  return path.resolve(process.env.APP_DOWNLOADS_DIR || "/data/downloads");
}

export interface DownloadFile {
  path: string;
  size: number;
  mtimeMs: number;
}

/**
 * Locate a build on disk, or null if it is not an allowed name or not there.
 *
 * The allowlist already rules out anything but four fixed names. The
 * containment check is there anyway, so that a careless addition to the list
 * cannot turn this into a way to read arbitrary files.
 */
export async function findDownload(file: string): Promise<DownloadFile | null> {
  if (!ALLOWED.has(file)) return null;

  const dir = downloadsDir();
  const full = path.resolve(dir, file);
  if (path.dirname(full) !== dir) return null;

  try {
    const info = await stat(full);
    if (!info.isFile()) return null;
    return { path: full, size: info.size, mtimeMs: info.mtimeMs };
  } catch {
    // Missing file, missing directory, unreadable mount: all "not published".
    return null;
  }
}
