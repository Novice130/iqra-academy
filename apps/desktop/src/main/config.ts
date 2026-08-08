/**
 * The handful of things every other module needs to agree on.
 */

/**
 * The site the app is a window onto.
 *
 * `NT_APP_URL` points it at a dev server. It is read once, at startup, and
 * everything that decides "is this us?" goes through `isAppUrl` rather than
 * comparing strings — a link to `www.` is still us, and a link to Google is
 * not, no matter which page it came from.
 */
export const APP_URL = process.env.NT_APP_URL || 'https://novicetutor.com';

const APP_ORIGIN = new URL(APP_URL);

/** Hosts that stay inside the app window. Everything else goes to the browser. */
export function isAppUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    return (
      url.host === APP_ORIGIN.host ||
      url.host === `www.${APP_ORIGIN.host}` ||
      url.host === APP_ORIGIN.host.replace(/^www\./, '')
    );
  } catch {
    return false;
  }
}

/** Absolute URL for a path on the app, e.g. `/dashboard`. */
export function appUrl(path: string): string {
  return new URL(path, APP_URL).toString();
}

/**
 * Marks the app in the user agent, the same way the Android shell does.
 *
 * The web app keys features off this string rather than off a bridge object
 * existing, because an old install has the bridge too — that is how you ship a
 * button that does nothing. Bump it when the preload API changes.
 */
export const USER_AGENT_SUFFIX = 'NoviceTutorDesktop/1.0';

/** Deep links: novicetutor://dashboard/session/abc */
export const PROTOCOL = 'novicetutor';

export const RING_POLL_INTERVAL_MS = 3000;
