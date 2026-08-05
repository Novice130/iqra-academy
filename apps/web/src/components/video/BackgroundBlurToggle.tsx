'use client';

/**
 * Background Blur Toggle — Google Meet style, applies to your own camera
 * only. Uses @livekit/track-processors (MediaPipe segmentation under the
 * hood) so it runs entirely client-side, no server round-trip.
 */

import { useEffect, useRef, useState } from 'react';
import { Track, type LocalVideoTrack } from 'livekit-client';
import { useLocalParticipant } from '@livekit/components-react';
import { BackgroundProcessor, supportsBackgroundProcessors, type BackgroundProcessorWrapper } from '@livekit/track-processors';

export default function BackgroundBlurToggle() {
  const { localParticipant } = useLocalParticipant();
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);

  useEffect(() => {
    setSupported(supportsBackgroundProcessors());
  }, []);

  // Re-apply the processor if the camera track gets republished (e.g. the
  // user toggled their camera off and on) — a fresh LocalVideoTrack has no
  // processor attached even if blur was previously turned on.
  useEffect(() => {
    if (!enabled) return;
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (track && processorRef.current && track.getProcessor() !== processorRef.current) {
      track.setProcessor(processorRef.current).catch(() => {});
    }
  }, [enabled, localParticipant]);

  const toggle = async () => {
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) return;

    setBusy(true);
    try {
      if (enabled) {
        await track.stopProcessor();
        processorRef.current = null;
        setEnabled(false);
      } else {
        const processor = BackgroundProcessor({ mode: 'background-blur', blurRadius: 10 });
        await track.setProcessor(processor);
        processorRef.current = processor;
        setEnabled(true);
      }
    } catch (err) {
      console.error('Background blur toggle failed', err);
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-50"
      style={{
        background: enabled ? '#10b981' : 'rgba(255,255,255,0.1)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.25)',
      }}
    >
      {busy ? '…' : enabled ? 'Blur: On' : 'Blur Background'}
    </button>
  );
}
