"use client";

/**
 * Time zone — the one part of this page wired to something real.
 *
 * Class times are absolute instants shown in the viewer's zone. That zone
 * normally comes from the device, which is fine until the device is wrong:
 * students in Illinois were shown 4:30 AM, their teacher's hour in India,
 * because their phone still thought it was in India. Setting it here takes
 * the device out of the decision.
 */

import { useEffect, useState } from "react";
import { formatInZone } from "@/components/LocalTime";

/** Where this school's people actually are, plus the obvious neighbours. */
const ZONES = [
  { id: "America/Chicago", label: "US Central — Illinois, Texas" },
  { id: "America/New_York", label: "US Eastern — New York, Georgia" },
  { id: "America/Denver", label: "US Mountain — Colorado" },
  { id: "America/Los_Angeles", label: "US Pacific — California" },
  { id: "Asia/Kolkata", label: "India" },
  { id: "Asia/Karachi", label: "Pakistan" },
  { id: "Asia/Dubai", label: "UAE" },
  { id: "Europe/London", label: "United Kingdom" },
  { id: "Australia/Sydney", label: "Australia — Sydney" },
];

export default function TimeZoneCard() {
  const [zone, setZone] = useState<string | null>(null);
  const [deviceZone, setDeviceZone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    try {
      setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    } catch {
      setDeviceZone("");
    }
    setNow(new Date());
    fetch("/api/me/timezone")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setZone(d?.timezone ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (next: string | null) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/me/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Couldn't save that.");
        return;
      }
      setZone(data.timezone ?? null);
      setMessage("Saved — reload to see class times in this zone.");
    } catch {
      setMessage("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const effective = zone || deviceZone;

  return (
    <section className="card mb-6">
      <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Time zone
        </h2>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Class times are shown in this zone. Leave it on your device&apos;s zone unless your device is set to
          the wrong country.
        </p>

        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Show my class times in
          </label>
          <select
            value={zone ?? ""}
            disabled={loading || saving}
            onChange={(e) => save(e.target.value === "" ? null : e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            <option value="">Use my device{deviceZone ? ` (${deviceZone})` : ""}</option>
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </div>

        {now && effective && (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Right now that reads {formatInZone(now, "date-time", true, effective)}.
          </p>
        )}

        {message && (
          <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
