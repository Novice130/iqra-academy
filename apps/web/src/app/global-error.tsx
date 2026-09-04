'use client';

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global Error caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0b0c0e', color: '#ffffff' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ maxWidth: '440px', width: '100%', padding: '32px', borderRadius: '16px', background: '#16181d', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px' }}>Application Error</h1>
            <p style={{ fontSize: '14px', color: '#9ca3af', margin: '0 0 24px' }}>
              We encountered an issue loading Novice Tutor.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => reset()}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', background: '#059669', color: '#ffffff', fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  window.location.href = '/dashboard';
                }}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: '#e5e7eb', fontWeight: 500, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
