'use client';

/**
 * Document Picture-in-Picture — Google Meet parity for desktop.
 *
 * Chrome/Edge can open a small always-on-top window (`documentPictureInPicture`)
 * that keeps rendering while the class tab is in the background, so a teacher
 * who switches to a worksheet or a browser tab keeps the class in view. Safari
 * and Firefox have no such API: the button hides, and those users still have
 * the native OS-level video PiP fallback inside the stage (the browser's own
 * right-click menu on a playing video).
 *
 * The popout carries a <video> per subscribed camera track plus a mute button.
 * Media elements keep playing in the popout on their own, but LiveKit's audio
 * renderers live in the main document — so the popout is video-only and the
 * class audio stays attached to the main tab, which also means muting there
 * does not silence the class for anyone else.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core';

interface DocumentPipWindow extends Window {
  documentPictureInPicture?: {
    requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
    window: Window | null;
    onenter?: (() => void) | null;
  };
}

export function useDocumentPip(tracks: TrackReferenceOrPlaceholder[]) {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  const supported =
    typeof window !== 'undefined' &&
    !!(window as DocumentPipWindow).documentPictureInPicture &&
    !(window as DocumentPipWindow).documentPictureInPicture?.window;

  const attach = useCallback((key: string, el: HTMLVideoElement | null) => {
    if (el) {
      videoElsRef.current.set(key, el);
      const t = tracksRef.current.find((ref) => `${ref.participant.identity}-${ref.source}` === key);
      const media = t && 'track' in t && t.track && 'mediaStream' in (t.track as object)
        ? (t.track as { mediaStream?: MediaStream }).mediaStream
        : undefined;
      try {
        if (media) el.srcObject = media;
      } catch {}
      el.play().catch(() => {});
    } else {
      videoElsRef.current.delete(key);
    }
  }, []);

  // Keep every popout video pointed at the current stream, and mirror the
  // muted state of tracks that come and go.
  useEffect(() => {
    if (!pipWindow) return;
    const live = new Set(
      tracks.map((t) => `${t.participant.identity}-${t.source}`)
    );
    videoElsRef.current.forEach((el, key) => {
      if (!live.has(key)) {
        el.srcObject = null;
        return;
      }
      const ref = tracks.find((t) => `${t.participant.identity}-${t.source}` === key);
      const media =
        ref && 'track' in ref && ref.track && 'mediaStream' in (ref.track as object)
          ? (ref.track as { mediaStream?: MediaStream }).mediaStream
          : undefined;
      try {
        if (media && el.srcObject !== media) el.srcObject = media;
      } catch {}
      el.play().catch(() => {});
    });
  }, [tracks, pipWindow]);

  const open = useCallback(async () => {
    const pip = (window as DocumentPipWindow).documentPictureInPicture;
    if (!pip) return;
    try {
      const win = await pip.requestWindow({ width: 420, height: 300 });
      const style = win.document.createElement('style');
      style.textContent = `
        html,body{margin:0;height:100%;background:#0d0f14;font-family:-apple-system,system-ui,sans-serif;overflow:hidden}
        .grid{display:grid;gap:6px;height:100%;padding:6px;box-sizing:border-box}
        .grid.auto{grid-template-columns:1fr 1fr}
        .grid.single{grid-template-columns:1fr}
        video{width:100%;height:100%;object-fit:cover;border-radius:10px;background:#000}
        .name{position:absolute;bottom:4px;left:6px;font-size:10px;color:#fff;background:rgba(0,0,0,.55);padding:1px 6px;border-radius:8px;pointer-events:none}
        .cell{position:relative;min-height:0;min-width:0}
      `;
      win.document.head.appendChild(style);
      const grid = win.document.createElement('div');
      grid.className = 'grid auto';
      win.document.body.appendChild(grid);
      setPipWindow(win);
      win.addEventListener('pagehide', () => setPipWindow(null));
    } catch {
      // User closed the permission dialog, or the browser refused — stay silent.
    }
  }, []);

  // Populate / repopulate the grid whenever the popout exists and tracks change.
  useEffect(() => {
    if (!pipWindow) return;
    const grid = pipWindow.document.querySelector('.grid');
    if (!grid) return;
    const cams = tracks.filter(
      (t) => t.source === Track.Source.Camera && 'track' in t && t.track && !(t.publication?.isMuted)
    );
    grid.className = cams.length > 1 ? 'grid auto' : 'grid single';
    const live = new Set(cams.map((t) => `${t.participant.identity}-${t.source}`));
    grid.querySelectorAll('.cell').forEach((cell) => {
      if (!live.has(cell.getAttribute('data-key') || '')) cell.remove();
    });
    for (const ref of cams) {
      const key = `${ref.participant.identity}-${ref.source}`;
      if (grid.querySelector(`[data-key="${CSS.escape(key)}"]`)) continue;
      const cell = pipWindow.document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('data-key', key);
      const video = pipWindow.document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      const label = pipWindow.document.createElement('span');
      label.className = 'name';
      label.textContent = ref.participant.name || ref.participant.identity.split('@')[0] || 'Participant';
      cell.appendChild(video);
      cell.appendChild(label);
      grid.appendChild(cell);
      attach(key, video);
    }
  }, [tracks, pipWindow, attach]);

  const close = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  useEffect(() => {
    return () => {
      if (pipWindow && !pipWindow.closed) pipWindow.close();
    };
  }, [pipWindow]);

  return { supported: !!supported, pipOpen: !!pipWindow, open, close };
}
