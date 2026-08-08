import { contextBridge, ipcRenderer } from 'electron';

export interface PickerSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
  isScreen: boolean;
}

contextBridge.exposeInMainWorld('picker', {
  list: (): Promise<PickerSource[]> => ipcRenderer.invoke('screen-share:sources'),
  choose: (id: string, withAudio: boolean) =>
    ipcRenderer.send('screen-share:choose', { id, withAudio }),
  cancel: () => ipcRenderer.send('screen-share:choose', null),
  platform: process.platform,
});
