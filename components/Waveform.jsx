'use client';
import { useEffect, useRef, useState } from 'react';

function placeholderPeaks(seed = 'x', bars = 120) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out = [];
  for (let i = 0; i < bars; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    out.push(0.12 + ((h % 1000) / 1000) * 0.18);
  }
  return out;
}

// Canvas waveform. Click or drag to seek. Peaks are 0..1 values.
export default function Waveform({
  peaks,
  progress = 0,
  onSeek,
  height = 64,
  seed = 'wave',
  loading = false,
  barWidth = 3,
  gap = 2,
  className = '',
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const bars = Math.max(8, Math.floor(width / (barWidth + gap)));
    const src = peaks && peaks.length ? peaks : placeholderPeaks(seed, bars);
    const mid = height / 2;

    const played = ctx.createLinearGradient(0, 0, width, 0);
    played.addColorStop(0, '#2ee6d6');
    played.addColorStop(1, '#ff4fa3');

    for (let i = 0; i < bars; i++) {
      const v = src[Math.floor((i / bars) * src.length)] ?? 0;
      const h = Math.max(2, v * (height - 4));
      const x = i * (barWidth + gap);
      const frac = (i + 0.5) / bars;
      if (!peaks || loading) ctx.fillStyle = '#1f2735';
      else if (frac <= progress) ctx.fillStyle = played;
      else if (hover !== null && frac <= hover) ctx.fillStyle = '#6b7890';
      else ctx.fillStyle = '#2c3647';
      const r = Math.min(barWidth / 2, 1.5);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, mid - h / 2, barWidth, h, r);
      else ctx.rect(x, mid - h / 2, barWidth, h);
      ctx.fill();
    }
  }, [peaks, progress, width, height, hover, seed, loading, barWidth, gap]);

  const fracFromEvent = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  return (
    <div
      ref={wrapRef}
      className={`relative w-full select-none ${onSeek ? 'cursor-pointer' : ''} ${className}`}
      style={{ height }}
      onPointerDown={(e) => {
        if (!onSeek) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onSeek(fracFromEvent(e));
      }}
      onPointerMove={(e) => {
        if (!onSeek) return;
        const f = fracFromEvent(e);
        setHover(f);
        if (dragging.current) onSeek(f);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => {
        dragging.current = false;
        setHover(null);
      }}
      role={onSeek ? 'slider' : undefined}
      aria-label={onSeek ? 'Seek' : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={onSeek ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onSeek) return;
        if (e.key === 'ArrowRight') onSeek(Math.min(1, progress + 0.02));
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - 0.02));
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-5 w-1 origin-center animate-pulsebar rounded-full bg-neon-cyan/70"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
