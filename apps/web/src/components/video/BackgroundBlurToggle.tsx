'use client';

/**
 * Background Effects — Google Meet / Teams style panel on your own camera
 * only: blur, or swap in a virtual background image. Uses
 * @livekit/track-processors (MediaPipe segmentation under the hood) so it
 * runs entirely client-side, no server round-trip.
 */

import { useEffect, useRef, useState } from 'react';
import { Track, type LocalVideoTrack } from 'livekit-client';
import { useLocalParticipant } from '@livekit/components-react';
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
  type SwitchBackgroundProcessorOptions,
} from '@livekit/track-processors';

type Mode = 'none' | 'blur' | 'image';

const VIRTUAL_BACKGROUNDS: { id: string; label: string; path: string }[] = [
  { id: 'sage', label: 'Sage', path: '/backgrounds/sage.svg' },
  { id: 'ocean', label: 'Ocean', path: '/backgrounds/ocean.svg' },
  { id: 'sand', label: 'Sand', path: '/backgrounds/sand.svg' },
  { id: 'lavender', label: 'Lavender', path: '/backgrounds/lavender.svg' },
  { id: 'charcoal', label: 'Charcoal', path: '/backgrounds/charcoal.svg' },
  { id: 'night-arches', label: 'Night Arches', path: '/backgrounds/night-arches.svg' },
];

export default function BackgroundBlurToggle() {
  const { localParticipant } = useLocalParticipant();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('none');
  const [imageId, setImageId] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);

  useEffect(() => {
    setSupported(supportsBackgroundProcessors());
  }, []);

  // Re-apply the processor if the camera track gets republished (e.g. the
  // user toggled their camera off and on) — a fresh LocalVideoTrack has no
  // processor attached even if an effect was previously turned on.
  useEffect(() => {
    if (mode === 'none') return;
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (track && processorRef.current && track.getProcessor() !== processorRef.current) {
      track.setProcessor(processorRef.current).catch(() => {});
    }
  }, [mode, localParticipant]);

  const getTrack = () => {
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    return pub?.track as LocalVideoTrack | undefined;
  };

  const apply = async (target: SwitchBackgroundProcessorOptions) => {
    const track = getTrack();
    if (!track) return;

    setBusy(true);
    try {
      if (target.mode === 'disabled') {
        if (processorRef.current) await track.stopProcessor();
        processorRef.current = null;
        setMode('none');
        setImageId(null);
        return;
      }

      if (processorRef.current) {
        await processorRef.current.switchTo(target);
      } else {
        const processor = BackgroundProcessor(target);
        await track.setProcessor(processor);
        processorRef.current = processor;
      }

      if (target.mode === 'background-blur') {
        setMode('blur');
        setImageId(null);
      } else {
        setMode('image');
      }
    } catch (err) {
      console.error('Background effect change failed', err);
    } finally {
      setBusy(false);
    }
  };

  const selectNone = () => apply({ mode: 'disabled' });
  const selectBlur = () => apply({ mode: 'background-blur', blurRadius: 10 });
  const selectImage = (bg: (typeof VIRTUAL_BACKGROUNDS)[number]) => {
    setImageId(bg.id);
    apply({ mode: 'virtual-background', imagePath: bg.path });
  };

  if (!supported) return null;

  const label = mode === 'blur' ? 'Blur' : mode === 'image' ? 'Background: On' : 'Background';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-50"
        style={{
          background: mode !== 'none' ? '#10b981' : 'rgba(255,255,255,0.1)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
        }}
      >
        {busy ? '…' : label}
      </button>

      {open && (
        <>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[85vw] max-w-xs sm:absolute sm:left-auto sm:right-0 sm:top-full sm:translate-x-0 sm:translate-y-0 sm:mt-2 sm:w-72 sm:max-w-none rounded-lg overflow-hidden shadow-2xl"
            style={{ background: '#1a1d24', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-white/50" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              Background effects
            </div>
            <div className="p-3 grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={selectNone}
                title="None"
                className="aspect-square rounded-md flex items-center justify-center text-[10px] font-semibold text-white cursor-pointer"
                style={{
                  background: '#2a2d35',
                  outline: mode === 'none' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.15)',
                  outlineOffset: '-1px',
                }}
              >
                None
              </button>
              <button
                type="button"
                onClick={selectBlur}
                title="Blur"
                className="aspect-square rounded-md flex items-center justify-center text-[10px] font-semibold text-white cursor-pointer"
                style={{
                  background: '#3a3d45',
                  backdropFilter: 'blur(4px)',
                  outline: mode === 'blur' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.15)',
                  outlineOffset: '-1px',
                }}
              >
                Blur
              </button>
              {VIRTUAL_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => selectImage(bg)}
                  title={bg.label}
                  className="aspect-square rounded-md bg-cover bg-center cursor-pointer"
                  style={{
                    backgroundImage: `url(${bg.path})`,
                    outline: mode === 'image' && imageId === bg.id ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.15)',
                    outlineOffset: '-1px',
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
