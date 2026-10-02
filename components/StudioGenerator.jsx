'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronDown,
  Clock3,
  Drum,
  Hash,
  Library,
  Loader2,
  Mic2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePlayer } from '@/components/PlayerProvider';
import Waveform from '@/components/Waveform';
import TrackArt from '@/components/TrackArt';
import DownloadMenu from '@/components/DownloadMenu';
import { usePeaks } from '@/lib/usePeaks';
import { formatTime } from '@/lib/audio';

const PRESET_TAGS = [
  'Hip-Hop', 'R&B', 'Neo-Soul', 'Trap', 'Boom Bap', 'Drill', 'Afrobeats', 'Amapiano',
  'House', 'Lo-fi', 'Gospel', 'Jazz', 'Funk', 'Reggae', 'Pop', 'Cinematic',
];
const MOODS = ['Smooth', 'Late night', 'Uplifting', 'Dark', 'Romantic', 'Hype', 'Chill'];
const SECTIONS = ['[Intro]', '[Verse]', '[Pre-Chorus]', '[Chorus]', '[Hook]', '[Bridge]', '[Outro]'];

const PROMPT_MAX = 300;
const LYRICS_MAX = 600;
const POLL_MS = 4000;

const STATUS_TEXT = {
  starting: 'Warming up the model',
  processing: 'Cooking the track',
  succeeded: 'Saved to your vault',
  failed: 'Generation failed',
  canceled: 'Canceled',
};

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function TagChip({ label, active, onClick, removable, onRemove }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`chip ${
        active
          ? 'border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan'
          : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500 hover:text-white'
      }`}
    >
      {label}
      {removable && (
        <X
          className="h-3 w-3 opacity-70 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </button>
  );
}

function JobCard({ job, now, onDismiss }) {
  const elapsed = Math.floor((now - job.startedAt) / 1000);
  const failed = job.status === 'failed' || job.status === 'canceled';
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 ${
        failed ? 'border-neon-pink/40 bg-neon-pink/5' : 'border-ink-700 bg-ink-850'
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          failed ? 'bg-neon-pink/15 text-neon-pink' : 'bg-neon-cyan/10 text-neon-cyan'
        }`}
      >
        {failed ? <AlertCircle className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{job.title}</div>
        <div className="truncate text-xs text-ink-400">
          {failed ? job.error || STATUS_TEXT[job.status] : STATUS_TEXT[job.status] || 'Queued'}
          {!failed && <span className="font-mono"> · {formatTime(elapsed)}</span>}
        </div>
      </div>
      <span className="label hidden !text-[10px] sm:inline">{job.mode === 'song' ? 'Vocals' : 'Beat'}</span>
      {failed && (
        <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function FeaturedTake({ track }) {
  const { isCurrent, playing, playTrack, toggle, time, duration, seek } = usePlayer();
  const peaks = usePeaks(track);
  const [showLyrics, setShowLyrics] = useState(false);
  const active = isCurrent(track.id);
  const progress = active && duration ? time / duration : 0;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <TrackArt track={track} size={88} rounded="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="label mb-1 !text-neon-cyan">Latest take</div>
          <h3 className="truncate font-display text-lg font-bold text-white sm:text-xl">{track.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(track.tags || []).slice(0, 5).map((t) => (
              <span key={t} className="chip border-ink-700 bg-ink-850 text-ink-300">{t}</span>
            ))}
            {track.model && (
              <span className="chip border-neon-violet/40 bg-neon-violet/10 font-mono text-[10px] text-neon-violet">
                {track.model}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-5">
        <Waveform
          peaks={peaks}
          progress={progress}
          seed={track.id}
          height={84}
          onSeek={(f) => (active ? seek(f) : playTrack(track))}
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-ink-400">
          <span>{formatTime(active ? time : 0)}</span>
          <span>{formatTime(active ? duration : track.duration)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-ink-800 px-4 py-3 sm:px-5">
        <button
          type="button"
          className="btn-primary"
          onClick={() => (active ? toggle() : playTrack(track))}
        >
          {active && playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
          {active && playing ? 'Pause' : 'Play take'}
        </button>
        <DownloadMenu track={track} align="left" />
        <Link href="/library" className="btn-ghost">
          <Library className="h-4 w-4" />
          Open in Library
        </Link>
        {track.lyrics && (
          <button
            type="button"
            className="btn ml-auto text-ink-300 hover:text-white"
            onClick={() => setShowLyrics((s) => !s)}
            aria-expanded={showLyrics}
          >
            Lyrics
            <ChevronDown className={`h-4 w-4 transition ${showLyrics ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {showLyrics && track.lyrics && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-ink-800 bg-ink-950/60 px-5 py-4 font-sans text-sm leading-relaxed text-ink-200">
          {track.lyrics}
        </pre>
      )}
    </div>
  );
}

function HistoryRow({ track, list, selected, onSelect }) {
  const { isCurrent, playing, playTrack, toggle } = usePlayer();
  const active = isCurrent(track.id);
  return (
    <li
      className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 transition ${
        selected ? 'bg-ink-800 ring-1 ring-ink-700' : 'hover:bg-ink-850'
      }`}
    >
      <button
        type="button"
        className="relative shrink-0"
        onClick={() => (active ? toggle() : playTrack(track, list))}
        aria-label={active && playing ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        <TrackArt track={track} size={42} />
        <span
          className={`absolute inset-0 flex items-center justify-center rounded-lg bg-ink-950/60 text-white transition ${
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {active && playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
        </span>
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <div className={`truncate text-sm font-semibold ${active ? 'text-neon-cyan' : 'text-white'}`}>{track.title}</div>
        <div className="truncate text-xs text-ink-400">
          {(track.tags || []).slice(0, 3).join(' · ') || 'No tags'}
        </div>
      </button>
      <span className="hidden font-mono text-[11px] tabular-nums text-ink-500 sm:inline">{timeAgo(track.created_at)}</span>
      <span className="w-10 text-right font-mono text-[11px] tabular-nums text-ink-400">{formatTime(track.duration)}</span>
    </li>
  );
}

export default function StudioGenerator() {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('song');
  const [tags, setTags] = useState(['R&B', 'Smooth']);
  const [customTag, setCustomTag] = useState('');
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [duration, setDuration] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const [jobs, setJobs] = useState([]);
  const [now, setNow] = useState(Date.now());
  const lyricsRef = useRef(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { tracks } = await api.listTracks({ source: 'ai' });
      setHistory(tracks);
    } catch (e) {
      setHistoryError(e.message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const pending = jobs.filter((j) => !['succeeded', 'failed', 'canceled'].includes(j.status));

  // Clock for elapsed timers
  useEffect(() => {
    if (!pending.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pending.length]);

  // Poll unfinished jobs
  useEffect(() => {
    if (!pending.length) return;
    let alive = true;
    const t = setTimeout(async () => {
      for (const job of pending) {
        try {
          const res = await api.pollGeneration(job.id);
          if (!alive) return;
          if (res.status === 'succeeded' && res.track) {
            setHistory((h) => [res.track, ...h.filter((x) => x.id !== res.track.id)]);
            setSelectedId(res.track.id);
            setJobs((js) => js.filter((j) => j.id !== job.id));
          } else {
            setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, status: res.status, error: res.error } : j)));
          }
        } catch (e) {
          if (!alive) return;
          setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, pollErrors: (j.pollErrors || 0) + 1 } : j)));
        }
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const description = useMemo(
    () => [tags.join(', '), prompt.trim()].filter(Boolean).join('. '),
    [tags, prompt]
  );

  const toggleTag = (t) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= 12 ? cur : [...cur, t]));

  const addCustomTag = () => {
    const t = customTag.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags((cur) => [...cur, t].slice(0, 12));
    setCustomTag('');
  };

  const insertSection = (s) => {
    const el = lyricsRef.current;
    const pos = el ? el.selectionStart : lyrics.length;
    const before = lyrics.slice(0, pos);
    const needsBreak = before && !before.endsWith('\n') ? '\n' : '';
    const next = `${before}${needsBreak}${s}\n${lyrics.slice(pos)}`;
    setLyrics(next.slice(0, LYRICS_MAX));
    requestAnimationFrame(() => {
      if (!el) return;
      const caret = before.length + needsBreak.length + s.length + 1;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const tooLong = mode === 'song' && description.length > PROMPT_MAX;
  const canGenerate =
    !submitting &&
    !tooLong &&
    (mode === 'song' ? description.length >= 10 && lyrics.trim().length >= 10 : description.length >= 3);

  const generate = async (e) => {
    e.preventDefault();
    if (!canGenerate) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.generate({ mode, title, tags, prompt, lyrics, duration });
      setJobs((js) => [
        { id: res.id, title: res.title, mode, status: res.status || 'starting', startedAt: Date.now() },
        ...js,
      ]);
      setNow(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setTitle('');
    setPrompt('');
    setLyrics('');
    setTags([]);
    setError(null);
  };

  const featured = history.find((t) => t.id === selectedId) || history[0] || null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">Studio Generator</div>
          <h1 className="text-balance font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Write it. Describe it. <span className="bg-gradient-to-r from-neon-cyan to-neon-pink bg-clip-text text-transparent">Press record.</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-400">
          <span className="h-2 w-2 rounded-full bg-neon-cyan shadow-glow" />
          {pending.length ? `${pending.length} in the booth` : 'Booth open'}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* ------- Prompt form ------- */}
        <form onSubmit={generate} className="panel flex min-w-0 flex-col gap-6 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label htmlFor="gen-title" className="label mb-2 block">Track title</label>
              <input
                id="gen-title"
                className="field"
                placeholder="Untitled Session"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div role="radiogroup" aria-label="Generation mode" className="grid grid-cols-2 rounded-xl border border-ink-700 bg-ink-850 p-1">
              {[
                { id: 'song', label: 'Song', sub: 'vocals', icon: Mic2 },
                { id: 'instrumental', label: 'Beat', sub: 'no vocals', icon: Drum },
              ].map(({ id, label, sub, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  onClick={() => setMode(id)}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    mode === id ? 'bg-ink-700 text-white shadow' : 'text-ink-400 hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${mode === id ? 'text-neon-cyan' : ''}`} />
                  {label}
                  <span className="hidden font-mono text-[10px] font-normal text-ink-400 xl:inline">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Style &amp; genre</span>
              <span className="font-mono text-[11px] text-ink-500">{tags.length}/12</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TAGS.map((t) => (
                <TagChip key={t} label={t} active={tags.includes(t)} onClick={() => toggleTag(t)} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {MOODS.map((t) => (
                <TagChip key={t} label={t} active={tags.includes(t)} onClick={() => toggleTag(t)} />
              ))}
              {tags
                .filter((t) => !PRESET_TAGS.includes(t) && !MOODS.includes(t))
                .map((t) => (
                  <TagChip key={t} label={t} active removable onClick={() => {}} onRemove={() => toggleTag(t)} />
                ))}
            </div>
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Hash className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
                <input
                  id="gen-custom-tag"
                  className="field pl-8"
                  placeholder="Add your own tag: 90 BPM, Rhodes, 808 slides"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                />
              </div>
              <button type="button" className="btn-ghost" onClick={addCustomTag} disabled={!customTag.trim()}>
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="gen-prompt" className="label mb-2 block">Describe the sound</label>
            <textarea
              id="gen-prompt"
              rows={3}
              className="field resize-y leading-relaxed"
              placeholder="Warm Rhodes chords, laid-back pocket, crisp snares, deep sub bass, silky male vocal with harmonies on the hook"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-ink-500">Tags and description are sent together as one prompt.</span>
              {mode === 'song' && (
                <span className={`font-mono tabular-nums ${tooLong ? 'text-neon-pink' : 'text-ink-500'}`}>
                  {description.length}/{PROMPT_MAX}
                </span>
              )}
            </div>
          </div>

          {mode === 'song' ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="gen-lyrics" className="label">Lyrics</label>
                <span className={`font-mono text-[11px] tabular-nums ${lyrics.length >= LYRICS_MAX ? 'text-neon-amber' : 'text-ink-500'}`}>
                  {lyrics.length}/{LYRICS_MAX}
                </span>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {SECTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => insertSection(s)}
                    className="chip border-ink-700 bg-ink-850 font-mono text-[11px] text-ink-300 hover:border-neon-violet/50 hover:text-neon-violet"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                id="gen-lyrics"
                ref={lyricsRef}
                rows={9}
                maxLength={LYRICS_MAX}
                className="field resize-y font-mono text-[13px] leading-6"
                placeholder={'[Verse]\nCity lights low, got the windows down\nSmooth on the dial, only sound in town\n\n[Chorus]\nRide slow, let it flow...'}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="gen-duration" className="label">Length</label>
                <span className="font-mono text-sm tabular-nums text-neon-cyan">{duration}s</span>
              </div>
              <input
                id="gen-duration"
                type="range"
                min={5}
                max={30}
                step={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full"
              />
              <p className="mt-2 text-xs text-ink-500">
                Beat mode renders instrumentals up to 30 seconds. Loop or extend them in your DAW.
              </p>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-neon-pink/40 bg-neon-pink/10 px-3.5 py-3 text-sm text-neon-pink">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 pt-5">
            <button type="submit" disabled={!canGenerate} className="btn-primary px-5 py-3 text-[15px] font-semibold">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generate Track
            </button>
            <button type="button" className="btn text-ink-400 hover:text-white" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Clear
            </button>
            <span className="ml-auto text-xs text-ink-500">
              {mode === 'song' ? 'Needs lyrics and 10+ characters of style.' : 'Needs a tag or a description.'}
            </span>
          </div>
        </form>

        {/* ------- Output column ------- */}
        <div className="flex min-w-0 flex-col gap-6">
          {jobs.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Generating">
              <div className="label">In the booth</div>
              {jobs.map((j) => (
                <JobCard key={j.id} job={j} now={now} onDismiss={() => setJobs((js) => js.filter((x) => x.id !== j.id))} />
              ))}
            </section>
          )}

          {featured ? (
            <FeaturedTake track={featured} />
          ) : (
            <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neon-cyan/10 text-neon-cyan">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="font-display text-base font-bold text-white">
                {historyLoading ? 'Loading your takes' : 'No takes yet'}
              </h3>
              <p className="max-w-sm text-sm text-ink-400">
                Pick a few tags, drop in lyrics, and press Generate Track. Every take is saved to your vault
                automatically.
              </p>
            </div>
          )}

          <section className="panel p-3 sm:p-4" aria-label="Take history">
            <div className="mb-2 flex items-center justify-between px-1.5">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-ink-400" />
                <span className="text-sm font-semibold text-white">Take history</span>
                <span className="font-mono text-[11px] text-ink-500">{history.length}</span>
              </div>
              <button type="button" className="btn px-2 py-1 text-xs text-ink-400 hover:text-white" onClick={loadHistory}>
                <RotateCcw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
            {historyError && <p className="px-2 py-3 text-sm text-neon-pink">{historyError}</p>}
            {historyLoading && !history.length ? (
              <div className="flex items-center gap-2 px-2 py-6 text-sm text-ink-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading takes
              </div>
            ) : history.length ? (
              <ul className="flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
                {history.map((t) => (
                  <HistoryRow
                    key={t.id}
                    track={t}
                    list={history}
                    selected={featured?.id === t.id}
                    onSelect={() => setSelectedId(t.id)}
                  />
                ))}
              </ul>
            ) : (
              !historyError && <p className="px-2 py-6 text-sm text-ink-400">Generated tracks show up here.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
