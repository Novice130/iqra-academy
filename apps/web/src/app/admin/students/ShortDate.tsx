"use client";

/**
 * @fileoverview "Mar 4, 2025" in the viewer's zone — LocalTime's `date` mode
 * has no year, and a join date or an invoice date needs one.
 *
 * Renders nothing until the zone is known, so the server's UTC render and the
 * browser's first render agree and hydration doesn't flicker a wrong day.
 */

import { useViewerTimeZone } from "@/components/LocalTime";

export default function ShortDate({ iso }: { iso: string }) {
  const tz = useViewerTimeZone();
  if (!tz) return null;
  return (
    <time dateTime={iso}>
      {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz }).format(new Date(iso))}
    </time>
  );
}
