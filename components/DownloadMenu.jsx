'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, FileAudio, Loader2 } from 'lucide-react';
import { downloadTrack } from '@/lib/audio';

// Download button with "Original" and "WAV" choices.
export default function DownloadMenu({ track, align = 'right', direction = 'down', className = '' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const run = async (format) => {
    setBusy(format);
    setErr(null);
    try {
      await downloadTrack(track, format);
      setOpen(false);
    } catch (e) {
      setErr(e.message || 'Download failed.');
    } finally {
      setBusy(null);
    }
  };

  const original = (track?.format || 'mp3').toUpperCase();

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Download"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={!track?.url}
      >
        <Download className="h-4 w-4" />
      </button>
      {open && (
        <div
          className={`absolute z-50 w-56 rounded-xl border border-ink-700 bg-ink-850 p-1.5 shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${direction === 'up' ? 'bottom-11' : 'top-11'}`}
        >
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-100 hover:bg-ink-700"
            onClick={() => run('original')}
          >
            {busy === 'original' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileAudio className="h-4 w-4 text-neon-cyan" />}
            <span className="flex-1">Download {original}</span>
            <span className="font-mono text-[10px] text-ink-400">original</span>
          </button>
          {original !== 'WAV' && (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-100 hover:bg-ink-700"
              onClick={() => run('wav')}
            >
              {busy === 'wav' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileAudio className="h-4 w-4 text-neon-pink" />}
              <span className="flex-1">Download WAV</span>
              <span className="font-mono text-[10px] text-ink-400">16-bit</span>
            </button>
          )}
          {err && <p className="px-3 py-1.5 text-xs text-neon-pink">{err}</p>}
        </div>
      )}
    </div>
  );
}
