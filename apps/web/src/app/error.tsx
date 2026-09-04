'use client';

import React, { useEffect } from 'react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root App Error caught:', error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 font-sans"
      style={{ background: 'var(--bg-secondary, #0b0c0e)', color: 'var(--text-primary, #ffffff)' }}
    >
      <div
        className="w-full max-w-md p-8 rounded-2xl text-center shadow-2xl"
        style={{ background: 'var(--bg-elevated, #16181d)', border: '1px solid var(--border, rgba(255,255,255,0.1))' }}
      >
        <div
          className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center text-2xl"
          style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}
        >
          ⚠️
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-2">Something went wrong</h2>
        <p className="text-sm mb-6 text-slate-400">
          An unexpected error occurred while loading this page.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => reset()}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all cursor-pointer shadow-sm"
            style={{ background: 'var(--accent, #059669)' }}
          >
            Try Again
          </button>
          <button
            onClick={() => {
              window.location.href = '/dashboard';
            }}
            className="w-full py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            style={{
              background: 'var(--bg-secondary, rgba(255,255,255,0.06))',
              color: 'var(--text-secondary, #e5e7eb)',
              border: '1px solid var(--border, rgba(255,255,255,0.1))',
            }}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
