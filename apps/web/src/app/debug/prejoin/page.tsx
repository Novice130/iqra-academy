'use client';

/**
 * The pre-join screen on its own, with nothing else attached.
 *
 * The real one lives at `/dashboard/session/[id]`, which cannot be reached
 * without LiveKit credentials — and those are absent from every local
 * environment (see docs). So the screen that every student sees immediately
 * before their class could not be looked at while it was being built, which is
 * how it stayed a two-column desktop layout for so long.
 *
 * A camera and a canvas, like `/debug/segmentation` beside it. No auth, no
 * database, and `onJoin` only reports what it was handed.
 */

import { useState } from 'react';
import PreJoinScreen, { type JoinChoices } from '@/components/video/PreJoinScreen';

export default function PreJoinBench() {
  const [picked, setPicked] = useState<JoinChoices | null>(null);

  if (picked) {
    return (
      <div style={{ minHeight: '100vh', background: '#131417', color: '#e8eaed', padding: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Joined with</h1>
        <pre style={{ fontSize: 13, lineHeight: 1.6 }}>{JSON.stringify(picked, null, 2)}</pre>
        <button
          onClick={() => setPicked(null)}
          style={{
            marginTop: 20,
            padding: '10px 18px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    );
  }

  return <PreJoinScreen userName="Test Teacher" onJoin={setPicked} />;
}
