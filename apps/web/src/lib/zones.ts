/**
 * @fileoverview The zone list, defined once.
 *
 * Both the student settings card and the teacher availability editor offer a
 * zone picker, and a teacher's zone is load-bearing for every student in the
 * org — so the two lists must not be allowed to drift apart.
 *
 * A short curated list beats the full IANA set of ~600: this school's people
 * are in a handful of places, and a searchable dropdown of six hundred entries
 * is how somebody ends up in America/Indiana/Petersburg by accident.
 *
 * @module lib/zones
 */

/** Where this school's people actually are, plus the obvious neighbours. */
export const ZONES = [
  { id: "America/Chicago", label: "US Central — Illinois, Texas" },
  { id: "America/New_York", label: "US Eastern — New York, Georgia" },
  { id: "America/Denver", label: "US Mountain — Colorado" },
  { id: "America/Los_Angeles", label: "US Pacific — California" },
  { id: "Asia/Kolkata", label: "India" },
  { id: "Asia/Karachi", label: "Pakistan" },
  { id: "Asia/Dubai", label: "UAE" },
  { id: "Europe/London", label: "United Kingdom" },
  { id: "Australia/Sydney", label: "Australia — Sydney" },
] as const;

/**
 * Does this runtime's own IANA database recognise the zone?
 *
 * The check matters wherever an unvetted string can reach `Intl` — a bad zone
 * throws a RangeError rather than degrading, so an unchecked value from the
 * database or from Cloudflare's geo headers can take down a render.
 */
export function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "India" if we know it, otherwise the raw IANA id. */
export function zoneLabel(zone: string): string {
  return ZONES.find((z) => z.id === zone)?.label ?? zone;
}
