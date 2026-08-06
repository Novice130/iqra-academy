'use client';

/**
 * Copy Link Button — copies a session's join URL so an admin can pass the
 * meeting link to someone out-of-band. Falls back to a prompt-free select
 * when the clipboard API is unavailable (non-HTTPS origins, older Safari).
 */

import { useState } from 'react';

export default function CopyLinkButton({
  path,
  label = 'Copy link',
}: {
  /** App-relative path, e.g. "/dashboard/session/abc123". */
  path: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
      style={{
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
      }}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
