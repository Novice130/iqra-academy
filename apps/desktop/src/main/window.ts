/**
 * The main window — one Chromium view onto novicetutor.com.
 *
 * Same bet as the Android shell (`docs/mobile-app.md`): the web app already
 * has every screen, and building them twice is how the two drift apart. What
 * the desktop shell adds is only what a browser tab cannot do — a tray, a ring
 * that works while minimised, a real window picker for screen sharing.
 */

import { BrowserWindow, app, shell, session, powerSaveBlocker } from 'electron';
import path from 'node:path';
import { APP_URL, USER_AGENT_SUFFIX, isAppUrl } from './config';

let mainWindow: BrowserWindow | null = null;
let wakeLock: number | null = null;

/** True once the user has genuinely asked to quit, rather than closed the window. */
let quitting = false;

export function markQuitting() {
  quitting = true;
}

export function isQuitting() {
  return quitting;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

export function createMainWindow(): BrowserWindow {
  const existing = getMainWindow();
  if (existing) return existing;

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a0a',
    title: 'Novice Tutor',
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // The window loads a remote site. Node stays out of it and everything
      // the page is allowed to ask for goes through the preload's narrow API.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Painting a white window and then the app is a flash of the wrong colour on
  // a dark call screen. Wait for the first frame.
  window.once('ready-to-show', () => window.show());

  window.webContents.setUserAgent(`${window.webContents.getUserAgent()} ${USER_AGENT_SUFFIX}`);

  // Closing is hiding. On Windows this is what Teams and Slack do, and it is
  // the only way the tray means anything — a quit-on-close app has nothing to
  // sit in the tray for. Quitting is the tray menu, or the app menu on macOS.
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });

  window.on('closed', () => {
    mainWindow = null;
  });

  wireNavigation(window);
  window.loadURL(APP_URL);

  mainWindow = window;
  return window;
}

/**
 * Keeps the app *an app*: our own pages load in the window, anything else
 * opens in the user's browser.
 *
 * This is not decoration. Google's OAuth pages refuse to render in an embedded
 * view at all, which is the same wall the Android shell hit, and a payment page
 * that opens inside a frameless app window is a phishing lesson waiting to
 * happen. `setWindowOpenHandler` covers `target=_blank`; `will-navigate`
 * covers ordinary links.
 */
function wireNavigation(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
}

/** Brings the window up whether it was hidden, minimised or merely behind something. */
export function showMainWindow(targetPath?: string) {
  const window = getMainWindow() ?? createMainWindow();
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
  if (targetPath) navigate(targetPath);
}

export function navigate(targetPath: string) {
  const window = getMainWindow();
  if (!window) return;
  // A full load would throw away the app's client-side state and flash the
  // login check again. Push it through the router the page already has, and
  // only fall back to a load if that fails (e.g. the page hasn't booted yet).
  const url = new URL(targetPath, APP_URL).toString();
  window.webContents
    .executeJavaScript(
      `(() => { try { window.history.pushState({}, '', ${JSON.stringify(url)});
        window.dispatchEvent(new PopStateEvent('popstate')); return true; } catch { return false; } })()`
    )
    .then((handled) => {
      if (!handled) window.loadURL(url);
    })
    .catch(() => window.loadURL(url));
}

/**
 * Grants the camera and microphone to our own pages without a second prompt.
 *
 * Electron asks on top of whatever the OS already asked, and a user who has
 * granted Windows the permission should not then be asked by us. Anything that
 * is not our origin is refused outright rather than passed to the user, since
 * nothing else has any business being loaded here in the first place.
 */
export function applyPermissionPolicy() {
  const allowed = new Set(['media', 'notifications', 'fullscreen', 'clipboard-sanitized-write']);

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(isAppUrl(contents.getURL()) && allowed.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) =>
    isAppUrl(origin) && allowed.has(permission)
  );
}

/**
 * Stops Windows sleeping mid-lesson.
 *
 * The web app takes a `navigator.wakeLock`, which the browser releases the
 * moment the tab is backgrounded — fine in a tab, wrong here, because a
 * minimised class is still a class. Driven by the page telling us a call is
 * running rather than guessed from the URL, so leaving a call releases it even
 * if the route doesn't change.
 */
export function setCallActive(active: boolean) {
  if (active && wakeLock === null) {
    wakeLock = powerSaveBlocker.start('prevent-display-sleep');
    return;
  }
  if (!active && wakeLock !== null) {
    if (powerSaveBlocker.isStarted(wakeLock)) powerSaveBlocker.stop(wakeLock);
    wakeLock = null;
  }
}

app.on('before-quit', () => {
  markQuitting();
  setCallActive(false);
});
