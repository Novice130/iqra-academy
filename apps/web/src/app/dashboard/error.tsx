'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard Error caught:', error);
  }, [error]);

  return (
    <div className="p-6 sm:p-10 max-w-2xl mx-auto font-sans">
      <div
        className="p-8 rounded-2xl text-center shadow-lg"
        style={{
          background: 'var(--bg-elevated, #16181d)',
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
        }}
      >
        <div
          className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center text-xl"
          style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}
        >
          ⚠️
        </div>
        <h2 className="text-lg font-bold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
          Could not load this dashboard section
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--text-secondary)' }}>
          {error.message || 'A temporary problem occurred while loading your dashboard.'}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer"
            style={{ background: 'var(--accent, #059669)' }}
          >
            Retry Loading
          </button>
          <button
            onClick={() => {
              window.location.href = '/dashboard';
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer"
            style={{
              background: 'var(--bg-secondary, rgba(255,255,255,0.06))',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            Refresh Dashboard
          </button>
          <Link
            href="/dashboard/settings"
            className="px-4 py-2.5 rounded-xl text-xs font-medium transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border)',
            }}
          >
            Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
