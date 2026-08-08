/**
 * Memory reporting, behind `NT_METRICS=1`.
 *
 * This exists because "Electron is heavy" is the standing objection to this
 * whole app, and it deserves a number rather than a reputation. Teams Classic
 * really did idle at the better part of a gigabyte, and Microsoft really did
 * rewrite it on WebView2 to halve that — so the question is fair. The answer
 * for *this* app is measurable, and it changes depending on whether the window
 * is up, which is exactly what a tray-resident app needs to know.
 *
 * `getAppMetrics` is Chromium's own accounting — the numbers in Chrome's task
 * manager — rather than summing RSS from `ps`, which counts shared framework
 * pages once per process and flatters nobody.
 */

import { app } from 'electron';
import { getMainWindow } from './window';

const INTERVAL_MS = 10_000;

export function startMetrics() {
  if (!process.env.NT_METRICS) return;

  const report = () => {
    const metrics = app.getAppMetrics();
    let total = 0;
    const lines = metrics.map((entry) => {
      // workingSetSize is in KB and is the figure a task manager shows.
      const mb = entry.memory.workingSetSize / 1024;
      total += mb;
      const name = entry.name ? ` ${entry.name}` : '';
      return `  ${entry.type}${name}: ${mb.toFixed(1)} MB`;
    });

    const window = getMainWindow();
    const visible = !!window && window.isVisible() && !window.isMinimized();
    console.log(
      `[metrics] ${visible ? 'window visible' : 'in tray'} — total ${total.toFixed(1)} MB\n` +
        lines.join('\n')
    );
  };

  setTimeout(report, 5000);
  setInterval(report, INTERVAL_MS);
}
