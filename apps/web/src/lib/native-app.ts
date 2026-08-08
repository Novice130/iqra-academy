/**
 * Is this page being rendered inside the Novice Tutor app?
 *
 * The app is a WebView over this same site, so every page has two audiences:
 * someone on novicetutor.com in a browser, and someone who tapped an icon on
 * their home screen and expects an app. The second one should not be shown a
 * marketing header, a floating WhatsApp bubble, or a hamburger menu.
 *
 * Detection is the user agent, which the shell sets to
 * `NoviceTutorApp/<version>` (see `lib/shell/web_shell.dart`,
 * `applicationNameForUserAgent`). The `(screenshare)` marker may or may not
 * follow it — that is a per-platform capability flag and says nothing about
 * whether we are in the app, so it is deliberately not part of this pattern.
 * Contrast `components/video/nativeScreenShare.ts`, which matches the marker
 * precisely because it is asking about the capability.
 *
 * No `next/headers` import here: this module is pulled into client components
 * too, and importing it would break the build. Callers on the server pass the
 * header in.
 */

const APP_UA = /NoviceTutorApp\//;

/** Server-side: pass `headers().get("user-agent")`. */
export function isNativeAppUserAgent(userAgent: string | null | undefined): boolean {
  return APP_UA.test(userAgent ?? "");
}

/** Client-side equivalent. */
export function isNativeAppClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return APP_UA.test(navigator.userAgent);
}
