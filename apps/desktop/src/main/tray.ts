/**
 * The tray icon, and the settings that only make sense next to it.
 *
 * Closing the window hides it (see window.ts), so this is the only way back to
 * a running app and the only way to genuinely quit one. Both matter: an app
 * that can be hidden with no way to quit is a bug report.
 */

import { Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';
import { markQuitting, showMainWindow } from './window';

let tray: Tray | null = null;

export function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../../resources/tray.png'));
  // macOS wants a template image so the icon inverts with the menu bar theme.
  // Windows wants the colour version, and setting this there does nothing.
  if (process.platform === 'darwin') icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('Novice Tutor');
  render();

  // Left click opens on Windows; macOS shows the menu, which is its convention.
  tray.on('click', () => {
    if (process.platform === 'darwin') return;
    showMainWindow();
  });

  return tray;
}

/** Rebuilt rather than mutated — a checkbox in a built Menu is immutable. */
function render() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Novice Tutor', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: 'Start when Windows starts',
        type: 'checkbox',
        checked: getAutoStart(),
        // Hidden on macOS, where login items live in System Settings and an
        // app toggling itself there is unwelcome.
        visible: process.platform === 'win32',
        click: (item) => {
          setAutoStart(item.checked);
          render();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          markQuitting();
          app.quit();
        },
      },
    ])
  );
}

export function getAutoStart(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

export function setAutoStart(enabled: boolean) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // Started by Windows means started for the tray, not to throw a window at
    // someone who is trying to log in. Teams does the same.
    args: enabled ? ['--hidden'] : [],
  });
}

/** True when Windows launched us at login, so the window should stay down. */
export function startedHidden(): boolean {
  return process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
}
