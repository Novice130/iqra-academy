/**
 * The installable builds, by platform.
 *
 * Shared by the download page and the route that streams the files. It lives
 * here rather than in the route because a Next route module may only export
 * handlers — exporting a constant from one fails the build with a type error
 * about the index signature, which is not an obvious way to be told that.
 *
 * A key here does not mean the object exists. The desktop builds are produced
 * on a Windows machine and uploaded by hand, so the page asks R2 what is
 * actually in the bucket before offering a link.
 */
export const ALLOWED_DOWNLOADS = {
  androidArm64: "novice-tutor.apk",
  androidArm32: "novice-tutor-arm32.apk",
  windows: "novice-tutor-setup.exe",
  macos: "novice-tutor.dmg",
} as const;

export type DownloadKey = (typeof ALLOWED_DOWNLOADS)[keyof typeof ALLOWED_DOWNLOADS];

/** Content types R2 may not have been told about at upload time. */
export const DOWNLOAD_CONTENT_TYPES: Record<string, string> = {
  ".apk": "application/vnd.android.package-archive",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".dmg": "application/x-apple-diskimage",
};
