'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Minus, Move, Plus, RotateCcw } from 'lucide-react';

// Drag and zoom a photo inside the cover frame so nothing important is cut off.
// Zoom all the way out to fit the whole photo; empty space is filled with a soft blurred copy.
export default function PhotoPositioner({ file, aspect = 1, onDone, onCancel, busy }) {
  const [img, setImg] = useState(null);
  const [src, setSrc] = useState(null);
  const [frame, setFrame] = useState({ w: 300, h: 300 });
  const [zoom, setZoom] = useState(1); // 1 = fill the frame
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image top-left inside frame (px)
  const wrapRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const measure = () => {
      const max = Math.min(wrapRef.current?.clientWidth || 320, aspect > 1 ? 560 : 340);
      setFrame({ w: max, h: Math.round(max / aspect) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [aspect]);

  const fill = img ? Math.max(frame.w / img.naturalWidth, frame.h / img.naturalHeight) : 1;
  const fit = img ? Math.min(frame.w / img.naturalWidth, frame.h / img.naturalHeight) : 1;
  const minZoom = fit / fill; // zoomed out far enough to see the whole photo
  const scale = fill * zoom;
  const w = img ? img.naturalWidth * scale : 0;
  const h = img ? img.naturalHeight * scale : 0;

  // Keep the photo where it covers the frame (or stays inside it when zoomed out)
  const clamp = (p, ww = w, hh = h) => {
    const cx = ww >= frame.w ? Math.min(0, Math.max(frame.w - ww, p.x)) : Math.max(0, Math.min(frame.w - ww, p.x));
    const cy = hh >= frame.h ? Math.min(0, Math.max(frame.h - hh, p.y)) : Math.max(0, Math.min(frame.h - hh, p.y));
    return { x: cx, y: cy };
  };

  // Center when the photo or frame changes
  useEffect(() => {
    if (!img) return;
    setZoom(1);
    setPos({ x: (frame.w - img.naturalWidth * fill) / 2, y: (frame.h - img.naturalHeight * fill) / 2 });
  }, [img, frame.w, frame.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const setZoomKeepCenter = (z) => {
    const nz = Math.max(minZoom, Math.min(4, z));
    const ns = fill * nz;
    const cx = (frame.w / 2 - pos.x) / scale;
    const cy = (frame.h / 2 - pos.y) / scale;
    const nw = img.naturalWidth * ns;
    const nh = img.naturalHeight * ns;
    setZoom(nz);
    setPos(clamp({ x: frame.w / 2 - cx * ns, y: frame.h / 2 - cy * ns }, nw, nh));
  };

  const finish = async () => {
    const out = aspect > 1 ? { w: 2400, h: Math.round(2400 / aspect) } : { w: 2048, h: 2048 };
    const k = out.w / frame.w;
    const c = document.createElement('canvas');
    c.width = out.w;
    c.height = out.h;
    const g = c.getContext('2d');
    // soft background for any empty space
    g.filter = 'blur(40px) brightness(0.6)';
    const bg = Math.max(out.w / img.naturalWidth, out.h / img.naturalHeight) * 1.15;
    g.drawImage(img, (out.w - img.naturalWidth * bg) / 2, (out.h - img.naturalHeight * bg) / 2, img.naturalWidth * bg, img.naturalHeight * bg);
    g.filter = 'none';
    g.drawImage(img, pos.x * k, pos.y * k, w * k, h * k);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    onDone(new File([blob], 'cover.jpg', { type: 'image/jpeg' }));
  };

  return (
    <div ref={wrapRef} className="flex flex-col items-center gap-3">
      <div
        className="relative cursor-grab touch-none overflow-hidden rounded-xl bg-ink-950 ring-2 ring-gold/70 active:cursor-grabbing"
        style={{ width: frame.w, height: frame.h }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, start: pos };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos(clamp({ x: drag.current.start.x + e.clientX - drag.current.x, y: drag.current.start.y + e.clientY - drag.current.y }));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => img && setZoomKeepCenter(zoom * (e.deltaY < 0 ? 1.08 : 0.92))}
      >
        {src && (
          <>
            <img src={src} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />
            {img && (
              <img
                src={src}
                alt="Your photo"
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ left: pos.x, top: pos.y, width: w, height: h }}
              />
            )}
          </>
        )}
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink-950/70 px-2 py-0.5 text-[11px] text-white">
          <Move className="h-3 w-3" /> Drag to move
        </span>
      </div>

      <div className="flex w-full max-w-sm items-center gap-2">
        <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => setZoomKeepCenter(zoom / 1.15)} disabled={!img}>
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          className="flex-1"
          min={Math.log(minZoom || 1)}
          max={Math.log(4)}
          step={0.01}
          value={Math.log(zoom)}
          onChange={(e) => setZoomKeepCenter(Math.exp(Number(e.target.value)))}
          disabled={!img}
        />
        <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => setZoomKeepCenter(zoom * 1.15)} disabled={!img}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className="text-center text-xs text-ink-400">Drag the photo to position it. Slide all the way left to fit the whole photo.</p>

      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => setZoomKeepCenter(minZoom)} disabled={!img}>
          <RotateCcw className="h-4 w-4" /> Show whole photo
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="btn-primary" onClick={finish} disabled={!img || busy}>
          <Check className="h-4 w-4" /> Done
        </button>
      </div>
    </div>
  );
}
