'use client';
import { useEffect, useRef } from 'react';
import { usePlayer } from '@/components/PlayerProvider';
import { activeLine } from '@/lib/lyrics';

// Karaoke-style lyrics that follow the song. Tap a line to jump there.
export default function SyncedLyrics({ track, className = '' }) {
  const { current, time, duration, seek, isCurrent } = usePlayer();
  const listRef = useRef(null);
  const lines = track?.lyrics_synced || [];
  const playingThis = isCurrent(track?.id);
  const idx = playingThis ? activeLine(lines, time + 0.15) : -1;

  useEffect(() => {
    if (idx < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-line="${idx}"]`);
    if (!el) return;
    const box = listRef.current;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [idx]);

  if (!lines.length) return null;

  return (
    <div ref={listRef} className={`relative overflow-y-auto scroll-smooth ${className}`}>
      <div className="h-[30%]" aria-hidden="true" />
      {lines.map((l, i) => {
        const state = i === idx ? 'now' : i < idx ? 'past' : 'next';
        return (
          <button
            key={i}
            type="button"
            data-line={i}
            onClick={() => playingThis && duration && seek(l.t / duration)}
            className={`block w-full py-1.5 text-left font-display font-bold leading-snug transition-all duration-300 ${
              state === 'now'
                ? 'scale-[1.02] text-xl text-gold sm:text-2xl'
                : state === 'past'
                  ? 'text-lg text-ink-500 sm:text-xl'
                  : 'text-lg text-ink-300 sm:text-xl'
            } ${playingThis ? 'hover:text-white' : 'cursor-default'}`}
          >
            {l.text}
          </button>
        );
      })}
      <div className="h-[40%]" aria-hidden="true" />
      {!playingThis && current?.id !== track?.id && (
        <p className="sticky bottom-0 bg-ink-900/90 py-2 text-xs text-ink-500">Play this song to follow along.</p>
      )}
    </div>
  );
}
