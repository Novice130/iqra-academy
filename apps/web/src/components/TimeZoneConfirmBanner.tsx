'use client';

/**
 * "We think you're in Asia/Kolkata — is that right?"
 *
 * WHY THIS EXISTS: class times are stored as instants and rendered in the
 * viewer's zone, but most people never open Settings to declare one. Until
 * they do, the browser is the only signal, and the browser is wrong often
 * enough to matter — a student in Illinois on a phone still set to India time
 * was shown 4:30 AM, their teacher's hour, not their own 6:00 PM.
 *
 * Cloudflare hands us the zone it derives from their IP on every request
 * (lib/viewer-zone.ts), which is a better guess than the handset. So we render
 * in it immediately and ask once whether to keep it.
 *
 * WHY WE ASK INSTEAD OF JUST SAVING IT: `users.timezone = null` already means
 * something — "keep trusting the device" — and it is a choice the settings
 * page deliberately offers. Writing the IP zone silently would pin a traveller
 * or a VPN user to one zone permanently with no sign it ever happened, and
 * would quietly switch off a setting they chose. Detect, show, let them decide.
 *
 * Dismissal is per-device in localStorage rather than in the database: the
 * answer "no, don't save that" is exactly the null we already have, so there is
 * nothing to write, and a second device with a different IP deserves to be
 * asked again.
 */

import { useEffect, useState } from 'react';
import { useViewerZoneSource } from './LocalTime';

/** Keyed by zone: a new guess after they travel is a new question. */
const dismissKey = (zone: string) => `tzbanner:dismissed:${zone}`;

export default function TimeZoneConfirmBanner() {
  const { timeZone, source } = useViewerZoneSource();
  // Starts hidden on both server and client so the first paint matches; the
  // effect below is what reads localStorage and reveals it.
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deviceZone, setDeviceZone] = useState<string | null>(null);

  useEffect(() => {
    if (source !== 'ip' || !timeZone) return;
    try {
      if (window.localStorage.getItem(dismissKey(timeZone))) return;
      setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      // Private mode, or a browser without Intl. Ask anyway — the worst case
      // is one extra banner.
    }
    setShow(true);
  }, [source, timeZone]);

  if (!show || !timeZone) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(dismissKey(timeZone), '1');
    } catch {
      /* Nothing to do; they will be asked again next visit. */
    }
    setShow(false);
  };

  const confirm = async () => {
    setSaving(true);
    try {
      await fetch('/api/me/timezone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: timeZone }),
      });
      // Reload rather than patch state: every rendered time on the page came
      // from the server's resolution, and the source is now `account`.
      window.location.reload();
    } catch {
      setSaving(false);
      dismiss();
    }
  };

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        margin: '0 0 16px',
        background: 'var(--accent-light)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: '13.5px',
        color: 'var(--text-primary)',
        lineHeight: 1.45,
      }}
    >
      <span style={{ flex: '1 1 260px' }}>
        Showing class times in <strong>{timeZone.replace(/_/g, ' ')}</strong>, detected from
        your connection.
        {deviceZone && deviceZone !== timeZone && (
          <span style={{ color: 'var(--text-secondary)' }}>
            {' '}
            Your device says {deviceZone.replace(/_/g, ' ')}.
          </span>
        )}
      </span>
      <span style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={confirm}
          disabled={saving}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#fff',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '8px',
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : "That's right"}
        </button>
        <button
          onClick={dismiss}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Not now
        </button>
      </span>
    </div>
  );
}
