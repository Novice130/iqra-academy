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

export default function WhiteboardOverlay({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

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

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    ctx.arc(pos.x, pos.y, (isEraser ? strokeWidth * 2 : strokeWidth) / 2, 0, Math.PI * 2);
    ctx.fillStyle = isEraser ? '#0f1117' : color;
    ctx.fill();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const currentPos = getPos(e);
    ctx.lineWidth = isEraser ? strokeWidth * 3 : strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isEraser ? '#0f1117' : color;

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  };

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
            ✏️ Pen
          </button>
          <button
            type="button"
            onClick={() => setIsEraser(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
              isEraser ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            🧹 Eraser
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

        {/* Actions */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
          <button
            type="button"
            onClick={clearCanvas}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 cursor-pointer transition"
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

      {/* Interactive Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full cursor-crosshair touch-none"
      />
    </div>
  );
}
