/**
 * The bridge the web app sees as `window.noviceTutorDesktop`.
 *
 * Everything crosses through `contextBridge`, so the page never touches Node
 * or Electron — it gets these functions and nothing else. Keep it that way:
 * the page is a remote document, and anything added here is added to the
 * attack surface of every script it ever loads.
 *
 * The web side treats this as optional (`window.noviceTutorDesktop?.…`) so the
 * same code runs in a plain browser.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('noviceTutorDesktop', {
  version: '1.0',

  /** A Windows toast. `path` is where clicking it should land. */
  notify(payload: { title: string; body: string; path?: string }) {
    ipcRenderer.send('app:notify', payload);
  },

  /** Hold the display awake while a class is running. */
  setCallActive(active: boolean) {
    ipcRenderer.send('app:call-active', active);
  },

  /** Answered or dismissed in the page — stop the app ringing for it too. */
  callHandled(id: string) {
    ipcRenderer.send('app:call-handled', id);
  },

  navigate(path: string) {
    ipcRenderer.send('app:navigate', path);
  },

  getAutoStart(): Promise<boolean> {
    return ipcRenderer.invoke('app:get-auto-start');
  },

  setAutoStart(enabled: boolean): Promise<boolean> {
    return ipcRenderer.invoke('app:set-auto-start', enabled);
  },

  minimiseToTray() {
    ipcRenderer.send('app:minimise-to-tray');
  },

  quit() {
    ipcRenderer.send('app:quit');
  },
});
