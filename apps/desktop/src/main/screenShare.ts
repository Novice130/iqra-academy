/**
 * Screen sharing: our own picker, wired underneath the Present button that is
 * already on the call screen.
 *
 * Nothing in the web app changes. `navigator.mediaDevices.getDisplayMedia`
 * exists in Electron, so `CallControlBar` takes the ordinary browser path and
 * `useTrackToggle` publishes the track exactly as it does in Chrome — this
 * only replaces the chooser that appears in between.
 *
 * Which is worth doing, because Chromium's built-in picker inside an Electron
 * app is a plain list with no thumbnails on Windows. Zoom and Teams show you
 * what you are about to broadcast, and "I shared the wrong window" is the one
 * screen-sharing mistake nobody recovers from gracefully.
 */

import {
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  session,
  shell,
  systemPreferences,
} from 'electron';
import path from 'node:path';

interface PickerSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
  isScreen: boolean;
}

let pickerWindow: BrowserWindow | null = null;
/** Resolves when the user picks or cancels. Only ever one at a time. */
let pending: ((choice: { id: string; withAudio: boolean } | null) => void) | null = null;

export function registerScreenShare() {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        if (!(await ensureScreenAccess())) {
          callback({});
          return;
        }

        const choice = await openPicker();
        if (!choice) {
          // Electron has no "user cancelled" signal; an empty callback is it,
          // and it surfaces in the page as a rejected getDisplayMedia — the
          // same thing Chrome does when you dismiss its picker, so LiveKit's
          // toggle flips itself back with no special handling.
          callback({});
          return;
        }

        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          fetchWindowIcons: false,
        });
        const source = sources.find((s) => s.id === choice.id);
        if (!source) {
          callback({});
          return;
        }

        callback({
          video: source,
          // System audio, and only where it exists. Windows can hand over the
          // loopback mix, which is what makes sharing a video with sound work
          // at all; macOS cannot without a kernel extension, and asking for it
          // there fails the whole request rather than degrading.
          audio: choice.withAudio && process.platform === 'win32' ? 'loopback' : undefined,
        });
      } catch {
        callback({});
      }
    },
    // Our picker replaces Chromium's, so don't let it draw one too.
    { useSystemPicker: false }
  );

  ipcMain.handle('screen-share:sources', () => listSources());
  ipcMain.on('screen-share:choose', (_event, choice: { id: string; withAudio: boolean } | null) => {
    resolvePicker(choice);
  });
}

/**
 * macOS only: screen recording is a system permission with no API to request.
 *
 * There is no entitlement for it and no prompt we can raise — `getSources`
 * just returns a list with nothing usable in it, so the picker opens empty and
 * the teacher concludes the feature is broken. Better to say what is wrong and
 * open the right settings pane. Windows needs none of this.
 *
 * The permission is read at process start, so it does not take effect until
 * the app is relaunched — hence the wording.
 */
async function ensureScreenAccess(): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  if (systemPreferences.getMediaAccessStatus('screen') === 'granted') return true;

  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Open Settings', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    message: 'Novice Tutor needs permission to share your screen',
    detail:
      'macOS asks for this once, in Privacy & Security. Turn on Screen Recording for Novice Tutor, then quit and reopen the app.',
  });

  if (response === 0) {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    );
  }
  return false;
}

/** Thumbnails big enough to recognise a window by, small enough to send over IPC. */
async function listSources(): Promise<PickerSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 200 },
    fetchWindowIcons: true,
  });

  return sources
    // Our own picker is a window like any other and would appear in its own
    // list, which is both confusing and a hall of mirrors if chosen.
    .filter((source) => source.name !== PICKER_TITLE)
    .map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
      isScreen: source.id.startsWith('screen:'),
    }));
}

const PICKER_TITLE = 'Choose what to share';

function openPicker(): Promise<{ id: string; withAudio: boolean } | null> {
  // A second request while one is open would strand the first one's promise
  // and leave the page waiting forever.
  if (pickerWindow) {
    resolvePicker(null);
  }

  return new Promise((resolve) => {
    pending = resolve;

    const display = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.min(900, Math.round(display.width * 0.8));
    const height = Math.min(620, Math.round(display.height * 0.8));

    pickerWindow = new BrowserWindow({
      width,
      height,
      title: PICKER_TITLE,
      resizable: true,
      minimizable: false,
      maximizable: false,
      // Modal to nothing in particular: the call may be full screen, and a
      // picker that hides behind it reads as the button having done nothing.
      alwaysOnTop: true,
      backgroundColor: '#1a1b1e',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/picker.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    pickerWindow.setMenuBarVisibility(false);
    pickerWindow.loadFile(path.join(__dirname, '../renderer/picker.html'));
    pickerWindow.once('ready-to-show', () => pickerWindow?.show());

    // Closed by the window chrome rather than by a button is still a cancel.
    pickerWindow.on('closed', () => {
      pickerWindow = null;
      if (pending) {
        pending(null);
        pending = null;
      }
    });
  });
}

function resolvePicker(choice: { id: string; withAudio: boolean } | null) {
  const resolve = pending;
  pending = null;
  const window = pickerWindow;
  pickerWindow = null;
  // Null the handles before closing: `closed` fires synchronously here and
  // would otherwise resolve the same promise a second time with null.
  if (window && !window.isDestroyed()) window.close();
  resolve?.(choice);
}
