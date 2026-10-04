'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Globe, Merge, Trash2, MessageSquare, Mic, Pause, Play, Repeat2, Share2, Sparkles, ThumbsDown, ThumbsUp, Undo2, Waves } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';
import TrackArt from '@/components/TrackArt';
import SongMenu from '@/components/SongMenu';
import { formatTime } from '@/lib/audio';

const REMIX = [
  ['cover', 'Cover', Repeat2],
  ['reuse', 'Reuse Prompt', Undo2],
  ['mashup', 'Mashup', Merge],
  ['sample', 'Sample this song', Waves],
  ['inspiration', 'Use as Inspiration', Sparkles],
  ['voice', 'Voice', Mic],
];

const VERSION_LABEL = {
  cover: 'Cover',
  mashup: 'Mashup',
  sample: 'Sample',
  inspiration: 'Inspired',
  voice: 'Voice',
  extend: 'Extended',
  crop: 'Cropped',
  remove: 'Section removed',
  reverse: 'Reversed',
  speed: 'Speed',
  fadein: 'Fade in',
  fadeout: 'Fade out',
  replace: 'Section replaced',
  remaster: 'Remastered',
  edit: 'Edited',
  studio: 'Studio mix',
};

export function versionLabel(t) {
  if (t.edit_note) return VERSION_LABEL[t.edit_note] || t.edit_note;
  if (t.source === 'ai') {
    const m = (t.model || '').match(/music-?([\d.]+)/i);
    return m ? `v${m[1]}` : t.model?.includes('musicgen') ? 'Beat' : 'AI';
  }
  return t.source === 'upload' ? 'Upload' : null;
}

function RemixButton({ track, actions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-ghost h-9 rounded-full px-3 text-xs" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Repeat2 className="h-4 w-4" /> <span className="hidden sm:inline">Remix</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-ink-700 bg-ink-850 p-1.5 shadow-2xl">
          {REMIX.map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-100 hover:bg-ink-700"
              onClick={() => {
                setOpen(false);
                actions.remix(k, track);
              }}
            >
              <Icon className="h-4 w-4 text-ink-300" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const pill = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850 px-2.5 text-xs font-semibold text-ink-200 transition hover:border-ink-500 hover:text-white';

// One song in a list, laid out like Suno's library rows.
export default function SongRow({ track, list, actions, selectable = false, selected = false, onSelect, compact = false }) {
  const { isCurrent, playing, playTrack, toggle } = usePlayer();
  const active = isCurrent(track.id);
  const v = versionLabel(track);
  const style = (track.tags || []).join(', ') || track.prompt || '';
  const play = () => (active ? toggle() : playTrack(track, list));

  return (
    <li className={`group flex items-center gap-3 rounded-2xl p-2 transition sm:p-2.5 ${active ? 'bg-ink-800/80 ring-1 ring-ink-700' : 'hover:bg-ink-850'}`}>
      {selectable && (
        <input type="checkbox" aria-label={`Select ${track.title}`} checked={selected} onChange={onSelect} className="hidden h-4 w-4 accent-[#e8b94a] sm:block" />
      )}
      <button type="button" onClick={play} className="relative shrink-0" aria-label={active && playing ? `Pause ${track.title}` : `Play ${track.title}`}>
        <TrackArt track={track} size={compact ? 52 : 64} rounded="rounded-xl" />
        <span className={`absolute inset-0 flex items-center justify-center rounded-xl bg-ink-950/50 text-white transition ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {active && playing ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="h-6 w-6" fill="currentColor" />}
        </span>
        <span className="absolute bottom-1 left-1 rounded bg-ink-950/80 px-1 font-mono text-[10px] tabular-nums text-white">{formatTime(track.duration)}</span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={play} className={`truncate text-left text-[15px] font-semibold ${active ? 'text-gold' : 'text-white'}`}>
            {track.title}
          </button>
          {v && <span className="hidden shrink-0 rounded bg-ink-800 px-1.5 py-px font-mono text-[10px] text-ink-300 sm:inline">{v}</span>}
          {track.pinned && <span className="hidden shrink-0 text-[10px] font-semibold text-gold sm:inline">PINNED</span>}
        </div>
        {style && <div className="truncate text-xs text-ink-400">{v && <span className="text-ink-300 sm:hidden">{v} · </span>}{style}</div>}
        {!compact && (
          <div className="mt-1.5 hidden flex-wrap items-center gap-1.5 sm:flex">
            <button type="button" className={pill} onClick={play} aria-label="Plays">
              <Play className="h-3 w-3" fill="currentColor" /> {track.plays || 0}
            </button>
            <button type="button" className={`${pill} ${track.liked ? '!border-gold/60 !bg-gold/15 !text-gold' : ''}`} onClick={() => actions.like(track)} aria-pressed={!!track.liked} aria-label="Like">
              <ThumbsUp className="h-3.5 w-3.5" fill={track.liked ? 'currentColor' : 'none'} /> {track.likes || 0}
            </button>
            <button type="button" className={`${pill} ${track.disliked ? '!text-neon-pink' : ''}`} onClick={() => actions.dislike(track)} aria-pressed={!!track.disliked} aria-label="Dislike">
              <ThumbsDown className="h-3.5 w-3.5" fill={track.disliked ? 'currentColor' : 'none'} />
            </button>
            {track.allow_comments !== false && (
              <Link href={`/song/${track.id}#comments`} className={pill} aria-label="Comments">
                <MessageSquare className="h-3.5 w-3.5" />
              </Link>
            )}
            <button type="button" className={pill} onClick={() => actions.open('share', track)}>
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
            <button type="button" className={`${pill} ${track.is_public ? '!border-white !bg-white !text-ink-950' : ''}`} onClick={() => actions.publish(track)}>
              {track.is_public && <Globe className="h-3.5 w-3.5" />} {track.is_public ? 'Published' : 'Publish'}
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={`icon-btn sm:hidden ${track.liked ? 'text-gold' : ''}`}
          onClick={() => actions.like(track)}
          aria-label="Like"
        >
          <ThumbsUp className="h-4 w-4" fill={track.liked ? 'currentColor' : 'none'} />
        </button>
        {!compact && <RemixButton track={track} actions={actions} />}
        <button
          type="button"
          className="icon-btn hidden h-9 w-9 hover:!text-neon-pink sm:inline-flex"
          aria-label={`Delete ${track.title}`}
          title="Delete"
          onClick={() => window.confirm(`Delete "${track.title}" forever? This can't be undone.`) && actions.remove(track)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <SongMenu track={track} actions={actions} triggerClass="icon-btn h-9 w-9 rounded-full" />
      </div>
    </li>
  );
}
