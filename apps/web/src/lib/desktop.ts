'use client';

/**
 * The desktop app, as the web app sees it.
 *
 * `apps/desktop` is an Electron shell around this site (see
 * `docs/desktop-app.md`). Its preload exposes `window.noviceTutorDesktop`, and
 * everything here is a thin, optional wrapper around that — every call is a
 * no-op in an ordinary browser, so callers never branch on the platform.
 *
 * The same rule as the Android shell applies: features key off the **version
 * marker**, not off the object existing. Every build of the shell has a
 * bridge, so "the bridge is there" proves nothing about whether the method you
 * are about to call is.
 */

interface DesktopBridge {
  version: string;
  notify(payload: { title: string; body: string; path?: string }): void;
  setCallActive(active: boolean): void;
  callHandled(id: string): void;
  navigate(path: string): void;
  getAutoStart(): Promise<boolean>;
  setAutoStart(enabled: boolean): Promise<boolean>;
  minimiseToTray(): void;
  quit(): void;
}

declare global {
  interface Window {
    noviceTutorDesktop?: DesktopBridge;
  }
}

function bridge(): DesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.noviceTutorDesktop;
}

/** True inside the desktop app. Safe during SSR, where it is always false. */
export function isDesktopApp(): boolean {
  return !!bridge();
}

/**
 * A native toast.
 *
 * Worth using over the in-page banner for anything the user needs while
 * looking at another window — which, in a tray-resident app, is most of the
 * time. `path` is where clicking it should take them.
 */
export function desktopNotify(title: string, body: string, path?: string) {
  bridge()?.notify({ title, body, path });
}

/**
 * Holds the display awake for the length of a call.
 *
 * The call screen already takes a `navigator.wakeLock`, and the browser drops
 * that as soon as the window is backgrounded. In a tab that is correct. Here
 * it is not: a class minimised to the tray is still a class, and the screen
 * going dark mid-lesson is the exact complaint the wake lock was added for.
 */
export function setDesktopCallActive(active: boolean) {
  bridge()?.setCallActive(active);
}

/**
 * Tells the app a ringing call has been dealt with in the page.
 *
 * Both sides can ring — the page while its window is visible, the app while it
 * is in the tray — and they hand over on visibility. Answering in one has to
 * silence the other, or a call accepted in the page keeps a ring window up.
 */
export function desktopCallHandled(callId: string) {
  bridge()?.callHandled(callId);
}
