/**
 * Novice Tutor for Windows.
 *
 * Entry point: single-instance lock, deep links, then the window and the four
 * things a browser tab cannot do — tray, ring-while-minimised, a real screen
 * picker, and native notifications.
 */

import { BrowserWindow, Notification, app, ipcMain } from 'electron';
import path from 'node:path';
import { PROTOCOL, isAppUrl } from './config';
import { startMetrics } from './metrics';
import { registerRing, markCallHandled } from './ring';
import { registerScreenShare } from './screenShare';
import { createTray, getAutoStart, setAutoStart, startedHidden } from './tray';
import {
  applyPermissionPolicy,
  createMainWindow,
  getMainWindow,
  markQuitting,
  navigate,
  setCallActive,
  showMainWindow,
} from './window';

// A second launch must reach the running app, not start a rival one holding
// its own tray icon and its own poll. Everything after this runs once.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main() {
  app.setAppUserModelId('com.novicetutor.desktop');

  app.on('second-instance', (_event, argv) => {
    showMainWindow();
    const link = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (link) openDeepLink(link);
  });

  // macOS delivers deep links as an event rather than in argv.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    openDeepLink(url);
  });

  app.whenReady().then(() => {
    registerProtocol();
    applyPermissionPolicy();
    registerScreenShare();
    registerBridge();

    const window = createMainWindow();
    createTray();
    registerRing();
    startMetrics();

    // Launched by Windows at login: come up in the tray, not in the user's face.
    if (startedHidden()) {
      window.once('ready-to-show', () => window.hide());
    }

    const link = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (link) openDeepLink(link);
  });

  // Windows and Linux: the tray is the app, so an app with no windows is still
  // running. macOS quits from the menu, and the dock icon reopens the window.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') return;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else showMainWindow();
  });
}

function registerProtocol() {
  // In development the executable is Electron itself, so the registration has
  // to name the script or Windows hands the link to a bare Electron.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

/** `novicetutor://dashboard/session/abc` → that page in the main window. */
function openDeepLink(link: string) {
  try {
    const url = new URL(link);
    const target = `${url.pathname}${url.search}` || '/dashboard';
    showMainWindow(target.startsWith('/') ? target : `/${target}`);
  } catch {
    showMainWindow();
  }
}

/**
 * What the page is allowed to ask the app for.
 *
 * Kept deliberately small and one-way where possible. Everything here exists
 * because the page cannot do it itself; nothing here does anything the page
 * could not already do to itself.
 */
function registerBridge() {
  ipcMain.on('app:notify', (event, payload: { title: string; body: string; path?: string }) => {
    if (!isAppUrl(event.senderFrame?.url ?? '')) return;
    if (!Notification.isSupported()) return;

    const notification = new Notification({ title: payload.title, body: payload.body });
    notification.on('click', () => showMainWindow(payload.path));
    notification.show();
  });

  ipcMain.on('app:call-active', (event, active: boolean) => {
    if (!isAppUrl(event.senderFrame?.url ?? '')) return;
    setCallActive(!!active);
  });

  ipcMain.on('app:call-handled', (event, id: string) => {
    if (!isAppUrl(event.senderFrame?.url ?? '')) return;
    markCallHandled(id);
  });

  ipcMain.on('app:navigate', (event, target: string) => {
    if (!isAppUrl(event.senderFrame?.url ?? '')) return;
    navigate(target);
  });

  ipcMain.handle('app:get-auto-start', () => getAutoStart());
  ipcMain.handle('app:set-auto-start', (event, enabled: boolean) => {
    if (!isAppUrl(event.senderFrame?.url ?? '')) return getAutoStart();
    setAutoStart(!!enabled);
    return getAutoStart();
  });

  ipcMain.on('app:quit', () => {
    markQuitting();
    app.quit();
  });

  ipcMain.on('app:minimise-to-tray', () => getMainWindow()?.hide());
}
