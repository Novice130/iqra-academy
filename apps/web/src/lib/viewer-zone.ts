/**
 * @fileoverview Which timezone are we showing this person their classes in?
 *
 * The rule this codebase already follows (docs/timezones.md): store instants,
 * format in the viewer's zone, never format on the server. This file answers
 * the one remaining question — *whose* zone, and how we find out.
 *
 * PRECEDENCE, highest first:
 *
 *   1. `users.timezone`  — an explicit choice. Survives travel and VPNs, and
 *                          beats everything, because a person who told us
 *                          where they are should not be second-guessed.
 *   2. `cf.timezone`     — the IANA zone Cloudflare derives from the visitor's
 *                          IP. Free, already on every request, no geo-IP
 *                          library. This is the new part.
 *   3. the browser       — `Intl.DateTimeFormat().resolvedOptions().timeZone`,
 *                          resolved client-side in LocalTime.tsx.
 *   4. UTC.
 *
 * WHY 2 EXISTS AT ALL: the device is wrong often enough to matter. The bug
 * recorded in LocalTime.tsx was a student in Illinois on a phone still set to
 * India time, shown their teacher's 4:30 AM instead of their own 6:00 PM. The
 * device said India and the device was lying; their IP was not.
 *
 * WHY WE DO NOT SILENTLY PERSIST THE IP ZONE: `users.timezone = null` already
 * *means* something — "keep trusting the device" — and it is an option the
 * settings page deliberately offers. Auto-filling it would pin a traveller or
 * a VPN user to one zone permanently, with no signal that it ever happened,
 * and would quietly disable a setting they chose. So we detect, show what we
 * detected, and let them confirm.
 *
 * @module lib/viewer-zone
 */

import { isValidZone } from "./zones";

export type ZoneSource = "account" | "ip" | "device";

/**
 * The visitor's zone according to Cloudflare's IP geolocation, or null.
 *
 * Null in every case where we cannot know: `next dev` outside a Worker, a
 * request Cloudflare could not place, or a zone string this runtime's IANA
 * database does not recognise. Every one of those must degrade to "ask the
 * browser" rather than throw — this runs in a layout that renders the whole
 * dashboard.
 */
export async function requestZone(): Promise<string | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const zone = (ctx?.cf as { timezone?: string } | undefined)?.timezone;
    if (typeof zone === "string" && zone.length > 0 && isValidZone(zone)) {
      return zone;
    }
    return null;
  } catch {
    // Not on a Worker, or called outside a request scope. Expected in dev.
    return null;
  }
}

/**
 * Resolve the zone to render in, plus where it came from.
 *
 * The source matters to the UI: a zone we guessed from an IP address should
 * be shown to the person with a way to correct it, and one they chose
 * themselves should not nag them.
 *
 * Returns `timeZone: null` for the device case, because that decision belongs
 * to the browser — the server has no way to know it, and guessing would break
 * the first-paint hydration parity LocalTime.tsx depends on.
 */
export async function resolveViewerZone(
  accountZone: string | null | undefined
): Promise<{ timeZone: string | null; source: ZoneSource }> {
  if (accountZone && isValidZone(accountZone)) {
    return { timeZone: accountZone, source: "account" };
  }

  const ip = await requestZone();
  if (ip) return { timeZone: ip, source: "ip" };

  return { timeZone: null, source: "device" };
}
