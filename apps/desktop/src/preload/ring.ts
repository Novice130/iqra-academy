import { contextBridge, ipcRenderer } from 'electron';

export interface RingCall {
  id: string;
  sessionId: string;
  callerName: string;
}

contextBridge.exposeInMainWorld('ring', {
  onCall(handler: (call: RingCall) => void) {
    ipcRenderer.on('ring:call', (_event, call: RingCall) => handler(call));
  },
  accept: (id: string) => ipcRenderer.send('ring:accept', id),
  decline: (id: string) => ipcRenderer.send('ring:decline', id),
});
