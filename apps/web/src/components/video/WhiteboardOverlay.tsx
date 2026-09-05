'use client';

import React, { useEffect, useRef, useState } from 'react';

const COLORS = [
  { id: '#ffffff', label: 'White' },
  { id: '#34d399', label: 'Emerald' },
  { id: '#60a5fa', label: 'Blue' },
  { id: '#fbbf24', label: 'Gold' },
  { id: '#f87171', label: 'Red' },
];

const STROKE_WIDTHS = [
  { id: 2, label: 'Fine' },
  { id: 5, label: 'Medium' },
  { id: 10, label: 'Bold' },
];

type Stroke = { x0: number; y0: number; x1: number; y1: number; color: string; width: number; erase?: boolean };

export default function WhiteboardOverlay({
  onClose,
  sessionId,
  isHost = false,
}: {
  onClose: () => void;
  sessionId?: string;
  isHost?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [syncState, setSyncState] = useState<'local' | 'syncing' | 'live' | 'locked'>('local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const drawStrokeRef = useRef<(s: Stroke) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      const prevCanvas = document.createElement('canvas');
      prevCanvas.width = canvas.width;
      prevCanvas.height = canvas.height;
      const prevCtx = prevCanvas.getContext('2d');
      if (prevCtx && canvas.width > 0 && canvas.height > 0) {
        prevCtx.drawImage(canvas, 0, 0);
      }

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (prevCanvas.width > 0 && prevCanvas.height > 0) {
          ctx.drawImage(prevCanvas, 0, 0, rect.width, rect.height);
        }
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const drawStroke = (st: Stroke) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    if (st.erase) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = st.color;
    }
    ctx.lineWidth = st.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(st.x0, st.y0);
    ctx.lineTo(st.x1, st.y1);
    ctx.stroke();
    ctx.restore();
  };

  useEffect(() => {
    drawStrokeRef.current = drawStroke;
  });

  const emitStroke = (st: Stroke) => {
    try {
      socketRef.current?.send(JSON.stringify({ type: 'stroke', stroke: st }));
    } catch {}
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (syncState === 'locked' && !isHost) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    isDrawingRef.current = true;
    const pos = getPos(e);
    lastPointRef.current = pos;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const currentPos = getPos(e);
    const st: Stroke = {
      x0: lastPointRef.current.x,
      y0: lastPointRef.current.y,
      x1: currentPos.x,
      y1: currentPos.y,
      color,
      width: isEraser ? strokeWidth * 3 : strokeWidth,
      erase: isEraser,
    };
    drawStroke(st);
    emitStroke(st);

    lastPointRef.current = currentPos;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && e.pointerId !== undefined) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearCanvas = () => {
    if (!isHost) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.restore();
    try {
      socketRef.current?.send(JSON.stringify({ type: 'clear' }));
    } catch {}
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/whiteboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      }).catch(() => {});
    }
  };

  const toggleLock = () => {
    if (!isHost) return;
    const next = syncState !== 'locked';
    try {
      socketRef.current?.send(JSON.stringify({ type: 'lock', locked: next }));
    } catch {}
    setSyncState(next ? 'locked' : 'live');
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/whiteboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: next }),
      }).catch(() => {});
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    setSyncState('syncing');
    setSyncError(null);
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/whiteboard`);
        if (!res.ok) throw new Error(`Ticket failed (${res.status})`);
        const data = await res.json();
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const base = process.env.NEXT_PUBLIC_REALTIME_URL || `${protocol}://${window.location.host}/realtime/whiteboard`;
        ws = new WebSocket(`${base}?ticket=${encodeURIComponent(data.ticket)}&sessionId=${encodeURIComponent(sessionId)}&boardId=${encodeURIComponent(data.boardId)}`);
        socketRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'init') {
              for (const st of msg.strokes ?? []) drawStrokeRef.current(st as Stroke);
              if (!cancelled) setSyncState(msg.locked && !isHost ? 'locked' : 'live');
            } else if (msg.type === 'stroke') {
              drawStrokeRef.current(msg.stroke as Stroke);
            } else if (msg.type === 'lock') {
              if (!cancelled) setSyncState(msg.locked && !isHost ? 'locked' : 'live');
            } else if (msg.type === 'clear') {
              const canvas = canvasRef.current;
              const ctx = canvas?.getContext('2d');
              if (canvas && ctx) {
                const dpr = window.devicePixelRatio || 1;
                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
                ctx.restore();
              }
            }
          } catch {}
        };
        ws.onerror = () => {
          if (!cancelled) {
            setSyncError('Sync connection failed — drawing stays local.');
            setSyncState('local');
          }
        };
        ws.onclose = () => {
          if (!cancelled && syncState === 'syncing') setSyncState('local');
        };
      } catch (e) {
        if (!cancelled) {
          setSyncError(e instanceof Error ? e.message : 'Sync unavailable — drawing stays local.');
          setSyncState('local');
        }
      }
    })();
    return () => {
      cancelled = true;
      try { ws?.close(); } catch {}
      socketRef.current = null;
    };
  }, [sessionId, isHost]);

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col overflow-hidden animate-fadeIn"
      style={{
        background: '#0f1117',
      }}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-2 rounded-2xl shadow-2xl backdrop-blur-2xl bg-neutral-900/90 border border-white/15 max-w-[95vw] overflow-x-auto">
        {/* Pen vs Eraser */}
        <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl">
          <button
            type="button"
            onClick={() => setIsEraser(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
              !isEraser ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Pen
          </button>
          <button
            type="button"
            onClick={() => setIsEraser(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
              isEraser ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Eraser
          </button>
        </div>

        {/* Colors */}
        {!isEraser && (
          <div className="flex items-center gap-1.5 px-2 border-l border-white/10">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                title={c.label}
                className="w-6 h-6 rounded-full cursor-pointer transition-transform active:scale-90 border-2"
                style={{
                  backgroundColor: c.id,
                  borderColor: color === c.id ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                  transform: color === c.id ? 'scale(1.2)' : 'none',
                }}
              />
            ))}
          </div>
        )}

        {/* Thickness */}
        <div className="flex items-center gap-1 px-2 border-l border-white/10">
          {STROKE_WIDTHS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStrokeWidth(s.id)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer transition ${
                strokeWidth === s.id ? 'bg-white/20 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Sync status */}
        <div className="flex items-center gap-1.5 px-2 border-l border-white/10" role="status" aria-live="polite">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: syncState === 'live' ? '#34d399' : syncState === 'syncing' ? '#fbbf24' : syncState === 'locked' ? '#f87171' : '#9ca3af' }}
          />
          <span className="text-[11px] text-white/60">
            {syncState === 'live' ? 'Shared' : syncState === 'syncing' ? 'Syncing…' : syncState === 'locked' ? 'Locked' : 'Local only'}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
          {isHost && (
            <button
              type="button"
              onClick={toggleLock}
              aria-label={syncState === 'locked' ? 'Unlock whiteboard' : 'Lock whiteboard'}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-amber-300 hover:bg-amber-500/10 cursor-pointer transition"
            >
              {syncState === 'locked' ? 'Unlock' : 'Lock'}
            </button>
          )}
          <button
            type="button"
            onClick={clearCanvas}
            disabled={!isHost}
            title={isHost ? 'Clear board for everyone' : 'Only the host can clear'}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 cursor-pointer transition disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs font-bold cursor-pointer transition"
          >
            ✕
          </button>
        </div>
      </div>

      {syncError && (
        <div role="alert" className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-red-500/20 border border-red-500/40 text-red-200">
          {syncError}
        </div>
      )}

      {/* Interactive Canvas */}
      <canvas
        ref={canvasRef}
        role="application"
        aria-label="Shared whiteboard canvas. Use pointer or touch to draw."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full cursor-crosshair touch-none"
      />
    </div>
  );
}
