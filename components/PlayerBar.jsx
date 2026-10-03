'use client';
import { useState } from 'react';
import { FileText, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';
import Waveform from '@/components/Waveform';
import TrackArt from '@/components/TrackArt';
import DownloadMenu from '@/components/DownloadMenu';
import { usePeaks } from '@/lib/usePeaks';
import { formatTime } from '@/lib/audio';

// Persistent player docked at the bottom of every page.
export default function PlayerBar() {
  const { current, playing, time, duration, volume, error, toggle, next, prev, seek, setVolume, queue } = usePlayer();
  const peaks = usePeaks(current);
  const [showLyrics, setShowLyrics] = useState(false);
  if (!current) return null;

  const progress = duration ? time / duration : 0;
  const pos = queue.findIndex((t) => t.id === current.id);

  return (
    <div
      className="fixed inset-x-0 bottom-[60px] z-40 border-t border-ink-700 bg-ink-900/95 backdrop-blur-xl md:bottom-0 md:left-64"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {showLyrics && (
        <div className="absolute inset-x-0 bottom-full max-h-[60vh] overflow-y-auto border-t border-ink-700 bg-ink-900/95 px-5 py-4 backdrop-blur-xl md:px-8">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="label">Lyrics</div>
                <div className="truncate font-display text-base font-bold text-gold">{current.title}</div>
              </div>
              <button type="button" className="icon-btn" aria-label="Close lyrics" onClick={() => setShowLyrics(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {current.lyrics ? (
              <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-ink-100">{current.lyrics}</pre>
            ) : (
              <p className="text-sm text-ink-400">
                No lyrics saved for this song. In My Library, open the song's ••• menu and choose Add lyrics.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Thin progress line on mobile */}
      <div className="h-[2px] w-full bg-ink-800 md:hidden">
        <div
          className="h-full bg-gradient-to-r from-neon-cyan to-neon-pink"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>

      <div className="flex items-center gap-3 px-3 py-2.5 md:gap-5 md:px-6 md:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:w-64 md:flex-none">
          <TrackArt track={current} size={44} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{current.title}</div>
            <div className="truncate text-xs text-ink-400">
              {current.artist || 'Dré Smoove'}
              {queue.length > 1 && (
                <span className="font-mono text-ink-500"> · {pos + 1}/{queue.length}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn hidden sm:inline-flex" onClick={prev} aria-label="Previous">
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink-950 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan"
          >
            {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
          </button>
          <button type="button" className="icon-btn" onClick={next} aria-label="Next">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <span className="w-10 text-right font-mono text-[11px] tabular-nums text-ink-400">{formatTime(time)}</span>
          <Waveform peaks={peaks} progress={progress} onSeek={seek} height={40} seed={current.id} barWidth={2} gap={2} />
          <span className="w-10 font-mono text-[11px] tabular-nums text-ink-400">{formatTime(duration)}</span>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <button
            type="button"
            className="icon-btn"
            aria-label={volume ? 'Mute' : 'Unmute'}
            onClick={() => setVolume(volume ? 0 : 0.9)}
          >
            {volume ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <input
            id="player-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
            className="w-24"
          />
        </div>

        <button
          type="button"
          className={`icon-btn ${showLyrics ? 'bg-ink-700 text-gold' : ''}`}
          aria-label={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
          aria-pressed={showLyrics}
          onClick={() => setShowLyrics((v) => !v)}
        >
          <FileText className="h-4 w-4" />
        </button>
        <DownloadMenu track={current} direction="up" className="hidden sm:block" />
      </div>
      {error && <p className="px-6 pb-2 text-xs text-neon-pink">{error}</p>}
    </div>
  );
}
