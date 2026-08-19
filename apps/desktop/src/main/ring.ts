/**
 * Incoming calls, including while the app is in the tray.
 *
 * The web app already rings — `IncomingCallOverlay` polls `/api/calls/incoming`
 * every 2.5s and draws a full-screen overlay. It also, deliberately, **stops
 * polling when `document.hidden`**: a backgrounded tab has no audio and nobody
 * looking at it, and that standing load is what took the worker down in August
 * (`docs/worker-limits.md`). Both of those hold for a tab and neither holds
 * here. A minimised desktop app is exactly the case that has to ring.
 *
 * So the poll moves to the main process while the window is hidden, and stands
 * down the moment it is visible again — the page takes over, and the two never
 * poll at once. Cookies come from the shared session, so this is the same
 * authenticated request the page makes.
 */

import { BrowserWindow, Notification, ipcMain, net, screen } from 'electron';
import path from 'node:path';
import { RING_POLL_INTERVAL_MS, appUrl } from './config';
import { getMainWindow, showMainWindow } from './window';

interface IncomingCall {
  id: string;
  sessionId: string;
  callerName: string;
}

let ringWindow: BrowserWindow | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let ringing: IncomingCall | null = null;
/** Calls already answered or dismissed here, so a stale poll can't re-ring them. */
const handled = new Set<string>();

export function registerRing() {
  ipcMain.on('ring:accept', (_event, id: string) => respond(id, 'accept'));
  ipcMain.on('ring:decline', (_event, id: string) => respond(id, 'decline'));

  // Kick the poll whenever the window's visibility changes, so hiding the app
  // mid-ring doesn't wait out an interval before the main process picks it up.
  const window = getMainWindow();
  if (window) {
    // Listed one by one rather than looped: BrowserWindow's `on` is a stack of
    // per-event overloads, and a union of names matches none of them.
    window.on('hide', syncPolling);
    window.on('show', syncPolling);
    window.on('minimize', syncPolling);
    window.on('restore', syncPolling);
    window.on('focus', syncPolling);
  }
  syncPolling();

  // `NT_DEMO_RING=1` pops a fake call a few seconds after launch. Without it
  // the only way to see this window is to have someone actually ring you,
  // which makes the ring UI the one screen in the app nobody can iterate on.
  if (process.env.NT_DEMO_RING) {
    setTimeout(
      () => startRinging({ id: 'demo', sessionId: 'demo', callerName: 'Ustadh Wajid' }),
      3000
    );
  }
}

/** The page rings when it can see; we ring when it can't. Never both. */
function syncPolling() {
  const window = getMainWindow();
  const pageCanRing = !!window && window.isVisible() && !window.isMinimized();

  if (pageCanRing) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    return;
  }
  if (!timer) {
    timer = setInterval(poll, RING_POLL_INTERVAL_MS);
    poll();
  }
}

async function poll() {
  if (ringing) return;
  try {
    const response = await net.fetch(appUrl('/api/calls/incoming'), {
      // The session cookie lives in the default session, which `net.fetch`
      // uses — the same jar the window authenticated into.
      credentials: 'include',
    });
    if (!response.ok) return;
    const data = (await response.json()) as { call: IncomingCall | null };
    const call = data.call;
    if (!call || handled.has(call.id)) return;
    startRinging(call);
  } catch {
    // Offline, or the user is signed out. Either way there is nothing to ring.
  }
}

function startRinging(call: IncomingCall) {
  ringing = call;

  const display = screen.getPrimaryDisplay().workAreaSize;
  const width = 360;
  const height = 460;

  ringWindow = new BrowserWindow({
    width,
    height,
    // Top-right, where Windows puts its own call toasts. Not centred: a box
    // that lands over whatever the user is reading is a worse interruption
    // than the call itself.
    x: display.width - width - 24,
    y: 24,
    frame: false,
    resizable: false,
    movable: true,
    skipTaskbar: false,
    alwaysOnTop: true,
    backgroundColor: '#111214',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/ring.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Above full-screen apps too — a teacher presenting in another app is
  // precisely who needs to see this.
  ringWindow.setAlwaysOnTop(true, 'screen-saver');
  ringWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  ringWindow.loadFile(path.join(__dirname, '../renderer/ring.html'));

  ringWindow.once('ready-to-show', () => {
    ringWindow?.showInactive();
    ringWindow?.webContents.send('ring:call', call);
    // The taskbar button flashes until looked at, which is how Windows says
    // "something wants you" without stealing focus from what you're typing.
    getMainWindow()?.flashFrame(true);
  });

  ringWindow.on('closed', () => {
    ringWindow = null;
  });

  // The caller gives up after 45s and the server stops returning the invite;
  // nothing else would take this window down in that case.
  setTimeout(() => {
    if (ringing?.id === call.id) stopRinging();
  }, 60_000);
}

function stopRinging() {
  ringing = null;
  getMainWindow()?.flashFrame(false);
  const window = ringWindow;
  ringWindow = null;
  if (window && !window.isDestroyed()) window.close();
}

async function respond(id: string, action: 'accept' | 'decline') {
  const call = ringing;
  handled.add(id);
  stopRinging();
  if (!call || call.id !== id) return;

  try {
    const response = await net.fetch(appUrl(`/api/calls/${id}/${action}`), {
      method: 'POST',
      credentials: 'include',
    });
    if (action !== 'accept') return;
    if (!response.ok) {
      new Notification({
        title: 'Could not join the call',
        body: 'The call may have already ended.',
      }).show();
      return;
    }
    const data = (await response.json()) as { sessionId?: string };
    showMainWindow(`/dashboard/session/${data.sessionId ?? call.sessionId}`);
  } catch {
    new Notification({
      title: 'Could not join the call',
      body: 'Check your connection and open the class from your dashboard.',
    }).show();
  }
}

/**
 * Lets the page hand over a call it saw first.
 *
 * While the window is visible the page is the one polling, and it should not
 * have to duplicate the ring window — it draws its own overlay. What it does
 * need is for the app to stop ringing once the user answers there.
 */
export function markCallHandled(id: string) {
  handled.add(id);
  if (ringing?.id === id) stopRinging();
}
