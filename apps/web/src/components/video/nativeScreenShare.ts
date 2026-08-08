'use client';

/**
 * Screen sharing on the Android app.
 *
 * Android's WebView has no `getDisplayMedia` — not blocked, not behind a
 * permission, simply not implemented — so `useTrackToggle({ ScreenShare })`
 * has nothing to call and the browser path cannot work inside the app no
 * matter what is granted. Zoom and Teams capture natively via
 * MediaProjection, and that is what the Flutter shell does too.
 *
 * The division of labour:
 *   - this page mints the token (it holds the session cookie; Dart does not)
 *   - the shell captures the screen and publishes it into the same room as a
 *     second, screen-only participant
 *   - the tile shows up here like any other remote screen share, because to
 *     LiveKit that is exactly what it is
 *
 * On desktop none of this loads: `isNativeShell()` is false and the ordinary
 * `getDisplayMedia` toggle stays in charge.
 */

interface InAppWebViewBridge {
  callHandler: (name: string, ...args: unknown[]) => Promise<unknown>;
}

declare global {
  interface Window {
    flutter_inappwebview?: InAppWebViewBridge;
    /** Called by the shell when the share stops on the native side. */
    __ntScreenShareEnded?: () => void;
  }
}

/**
 * True inside a build of the app that can actually capture the screen.
 *
 * The bridge existing is not enough to go on — every version of the shell has
 * one, including the ones installed before this shipped, and calling a
 * handler they don't register just returns null. That would put a button on
 * their call screen that does nothing at all. So the shell advertises the
 * capability in its user agent and this looks for that, which also means a
 * user who never updates simply doesn't see the button.
 */
export function isNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.flutter_inappwebview?.callHandler !== 'function') return false;
  return /NoviceTutorApp\/[\d.]+ \(screenshare\)/.test(navigator.userAgent);
}

/** `qlms-<sessionId>` — the one place the room name is taken apart again. */
export function sessionIdFromRoom(roomName: string | undefined): string | null {
  if (!roomName) return null;
  return roomName.startsWith('qlms-') ? roomName.slice('qlms-'.length) : null;
}

/**
 * Why a share didn't start, in words the teacher can act on.
 *
 * `declined` deliberately has no message: saying "you declined" to someone who
 * just declined is noise. Everything else does, because a Present button that
 * quietly stays off looks like the app is broken.
 */
const FAILURE_MESSAGES: Record<string, string | null> = {
  declined: null,
  serviceBlocked: "Android wouldn't allow screen capture. Open the app from the class and try again.",
  connectFailed: "Couldn't connect the screen to the class. Check your connection and try again.",
};

export interface NativeShareResult {
  started: boolean;
  /** Null when there is nothing worth saying — including on success. */
  message: string | null;
}

/**
 * Starts the native share. Resolves once the shell reports the screen track is
 * publishing — which is *after* the Android system dialog, so the button must
 * show a pending state until this returns rather than flipping to "on" the
 * moment it is tapped.
 */
export async function startNativeScreenShare(sessionId: string): Promise<NativeShareResult> {
  const failed = (message: string | null): NativeShareResult => ({ started: false, message });
  if (!isNativeShell()) return failed(null);

  const res = await fetch(`/api/sessions/${sessionId}/screen-token`);
  if (!res.ok) return failed("Couldn't get permission to share into this class.");
  const { token, url, roomName } = await res.json();
  if (!token || !url) return failed("Couldn't get permission to share into this class.");

  const reply = await window.flutter_inappwebview!.callHandler('startScreenShare', {
    url,
    token,
    roomName,
  });

  // Shells before 1.2 answer a bare `true`/`false` with no reason attached.
  if (reply === true) return { started: true, message: null };
  if (reply === false || reply == null) return failed(null);

  const { ok, reason } = reply as { ok?: boolean; reason?: string };
  if (ok) return { started: true, message: null };
  return failed(
    (reason && reason in FAILURE_MESSAGES ? FAILURE_MESSAGES[reason] : undefined) ??
      "Couldn't start sharing your screen."
  );
}

export async function stopNativeScreenShare(): Promise<void> {
  if (!isNativeShell()) return;
  await window.flutter_inappwebview!.callHandler('stopScreenShare');
}

/**
 * Whether a native share is running, shared between the control bar's button
 * and the "Live" pill over the video.
 *
 * A module-level store rather than React state passed around: the share can
 * also end from outside the page entirely — the Stop action on the Android
 * notification, or the system's own cast control — and both pieces of UI have
 * to follow that, not just the one that started it.
 */
type Listener = (sharing: boolean) => void;
const listeners = new Set<Listener>();
let sharing = false;

export function setNativeSharing(next: boolean) {
  if (sharing === next) return;
  sharing = next;
  listeners.forEach((l) => l(next));
}

export function subscribeNativeSharing(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNativeSharing(): boolean {
  return sharing;
}
