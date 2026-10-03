'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  FastForward,
  Gauge,
  Heart,
  Loader2,
  Pause,
  Play,
  Redo2,
  Replace,
  Save,
  Scissors,
  SquareSplitHorizontal,
  TrendingDown,
  TrendingUp,
  Undo2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api } from '@/lib/api';
import { extendWithAI } from '@/lib/aiExtend';
import { usePlayer } from '@/components/PlayerProvider';
import TrackArt from '@/components/TrackArt';
import { decodeFromUrl, encodeWav, formatTime, peaksFromBuffer } from '@/lib/audio';
import {
  appendContinuation,
  changeSpeed,
  columns,
  crop,
  fade,
  REMASTER_PRESETS,
  remaster,
  removeRange,
  replaceRange,
  reverse,
  slice,
} from '@/lib/audioEdit';

const TOOLS = [
  ['crop', 'Crop', Scissors, 'Keep only the selected part.'],
  ['remove', 'Remove Section', SquareSplitHorizontal, 'Cut the selected part out and join the rest smoothly.'],
  ['reverse', 'Reverse', Undo2, 'Play the selection (or the whole song) backwards.'],
  ['speed', 'Adjust Speed', Gauge, 'Faster or slower, with or without changing the key.'],
  ['fadein', 'Fade In', TrendingUp, 'Start from silence.'],
  ['fadeout', 'Fade Out', TrendingDown, 'End by fading to silence.'],
  ['remaster', 'Remaster', Wand2, 'Clearer, fuller and louder, like a mastering engineer would do.'],
  ['extend', 'Extend', FastForward, 'The AI keeps the song going past the end.'],
  ['replace', 'Replace Section', Replace, 'The AI re-sings the selected part in a new style or with new words.'],
  ['hook', 'Make Hook', Heart, 'Save the selection as a hook in your Library.'],
];

const NEEDS_SELECTION = ['crop', 'remove', 'replace', 'hook'];

function useAudioPreview() {
  const ctxRef = useRef(null);
  const srcRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const startRef = useRef({ at: 0, offset: 0, end: 0 });
  const rafRef = useRef(null);

  const stop = useCallback(() => {
    try {
      srcRef.current?.stop();
    } catch {}
    srcRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
  }, []);

  const play = useCallback(
    (buffer, from = 0, to = buffer.duration) => {
      stop();
      if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = ctxRef.current;
      ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0, from, Math.max(0.05, to - from));
      src.onended = () => {
        if (srcRef.current === src) {
          setPlaying(false);
          cancelAnimationFrame(rafRef.current);
        }
      };
      srcRef.current = src;
      startRef.current = { at: ctx.currentTime, offset: from, end: to };
      setPlaying(true);
      const tick = () => {
        const s = startRef.current;
        setPos(Math.min(s.end, s.offset + (ctx.currentTime - s.at)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [stop]
  );

  useEffect(() => stop, [stop]);
  return { play, stop, playing, pos, setPos };
}

function WaveCanvas({ buffer, sel, setSel, pos, onSeek, zoom }) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(800);
  const drag = useRef(null);
  const height = 180;

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(300, Math.floor(e.contentRect.width))));
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const full = width * zoom;
  const cols = useMemo(() => (buffer ? columns(buffer, Math.floor(full)) : null), [buffer, full]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !cols) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = full * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, full, height);
    const dur = buffer.duration;
    if (sel) {
      g.fillStyle = 'rgba(232,185,74,0.16)';
      g.fillRect((sel[0] / dur) * full, 0, ((sel[1] - sel[0]) / dur) * full, height);
    }
    const mid = height / 2;
    let peak = 0;
    for (let i = 0; i < cols.length; i++) peak = Math.max(peak, Math.abs(cols[i]));
    const scale = (mid - 6) / Math.max(0.05, peak);
    for (let x = 0; x < cols.length / 2; x++) {
      const t = (x / full) * dur;
      const inSel = sel && t >= sel[0] && t <= sel[1];
      g.fillStyle = inSel ? '#e8b94a' : '#3d4a5f';
      const lo = cols[x * 2] * scale;
      const hi = cols[x * 2 + 1] * scale;
      g.fillRect(x, mid - hi, 1, Math.max(1, hi - lo));
    }
    g.fillStyle = '#2ee6d6';
    g.fillRect((pos / dur) * full - 1, 0, 2, height);
    if (sel) {
      g.fillStyle = '#e8b94a';
      g.fillRect((sel[0] / dur) * full - 1, 0, 2, height);
      g.fillRect((sel[1] / dur) * full - 1, 0, 2, height);
    }
  }, [cols, sel, pos, buffer, full]);

  const timeAt = (e) => {
    const r = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(buffer.duration, ((e.clientX - r.left) / r.width) * buffer.duration));
  };

  return (
    <div ref={wrapRef} className="w-full overflow-x-auto rounded-xl border border-ink-700 bg-ink-950">
      <canvas
        ref={ref}
        style={{ width: full, height, touchAction: 'pan-x' }}
        className="block cursor-text"
        onPointerDown={(e) => {
          if (!buffer) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const t = timeAt(e);
          // Grab an edge of the current selection if close to it
          const px = (s) => (s / buffer.duration) * full;
          const x = px(t);
          if (sel && Math.abs(x - px(sel[0])) < 8) drag.current = { edge: 0 };
          else if (sel && Math.abs(x - px(sel[1])) < 8) drag.current = { edge: 1 };
          else drag.current = { from: t, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !buffer) return;
          const t = timeAt(e);
          if (drag.current.edge !== undefined) {
            const next = [...sel];
            next[drag.current.edge] = t;
            setSel([Math.min(next[0], next[1]), Math.max(next[0], next[1])]);
          } else if (Math.abs(t - drag.current.from) > 0.05) {
            drag.current.moved = true;
            setSel([Math.min(drag.current.from, t), Math.max(drag.current.from, t)]);
          }
        }}
        onPointerUp={(e) => {
          if (drag.current && drag.current.edge === undefined && !drag.current.moved) {
            onSeek(timeAt(e));
            setSel(null);
          }
          drag.current = null;
        }}
      />
    </div>
  );
}

export default function SongEditor({ id }) {
  const router = useRouter();
  const params = useSearchParams();
  const { playing: globalPlaying, toggle: globalToggle } = usePlayer();
  const [track, setTrack] = useState(null);
  const [buffer, setBuffer] = useState(null);
  const [history, setHistory] = useState([]); // [{buffer, note}]
  const [future, setFuture] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tool, setTool] = useState(params.get('tool') || 'crop');
  const [sel, setSel] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  // tool settings
  const [speed, setSpeed] = useState(100);
  const [keepPitch, setKeepPitch] = useState(true);
  const [fadeSecs, setFadeSecs] = useState(4);
  const [preset, setPreset] = useState('balanced');
  const [extendSecs, setExtendSecs] = useState(20);
  const [aiStyle, setAiStyle] = useState('');
  const [aiLyrics, setAiLyrics] = useState('');
  const [saveTitle, setSaveTitle] = useState('');

  const preview = useAudioPreview();

  useEffect(() => {
    let alive = true;
    api
      .getTrack(id)
      .then(async ({ track }) => {
        if (!alive) return;
        setTrack(track);
        setAiStyle((track.tags || []).join(', ') || track.prompt || '');
        setBusy('Loading the song');
        const buf = await decodeFromUrl(track.url);
        if (!alive) return;
        setBuffer(buf);
        setBusy(null);
        const d = buf.duration;
        if (['crop', 'remove', 'replace', 'hook'].includes(params.get('tool'))) setSel([d * 0.35, Math.min(d, d * 0.35 + 20)]);
      })
      .catch((e) => {
        setError(e.message);
        setBusy(null);
      });
    return () => {
      alive = false;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async (label, fn, note) => {
    setError(null);
    setBusy(label);
    preview.stop();
    try {
      await new Promise((r) => setTimeout(r, 30));
      const next = await fn(buffer);
      setHistory((h) => [...h.slice(-5), { buffer, note: notes }]);
      setFuture([]);
      setBuffer(next);
      setNotes((n) => [...n, note]);
      setSel(null);
      preview.setPos(0);
    } catch (e) {
      setError(e.message || 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setFuture((f) => [{ buffer, note: notes }, ...f]);
    setHistory((h) => h.slice(0, -1));
    setBuffer(last.buffer);
    setNotes(last.note);
  };
  const redo = () => {
    const nxt = future[0];
    if (!nxt) return;
    setHistory((h) => [...h, { buffer, note: notes }]);
    setFuture((f) => f.slice(1));
    setBuffer(nxt.buffer);
    setNotes(nxt.note);
  };

  const uploadClip = async (buf, name) => {
    const wav = encodeWav(buf);
    return api.uploadAudio(new File([wav], `${name}.wav`, { type: 'audio/wav' }));
  };

  const runTool = async () => {
    if (!buffer) return;
    const hasSel = sel && sel[1] - sel[0] > 0.2;
    if (NEEDS_SELECTION.includes(tool) && !hasSel) {
      setError('Drag across the waveform to select a part of the song first.');
      return;
    }
    const [s, e] = hasSel ? sel : [0, buffer.duration];
    switch (tool) {
      case 'crop':
        return apply('Cropping', (b) => crop(b, s, e), 'crop');
      case 'remove':
        return apply('Removing the section', (b) => removeRange(b, s, e), 'remove');
      case 'reverse':
        return apply('Reversing', (b) => reverse(b, s, e), 'reverse');
      case 'speed':
        return apply('Changing the speed', (b) => changeSpeed(b, speed / 100, keepPitch), 'speed');
      case 'fadein':
        return apply('Adding the fade', (b) => fade(b, 'in', fadeSecs), 'fadein');
      case 'fadeout':
        return apply('Adding the fade', (b) => fade(b, 'out', fadeSecs), 'fadeout');
      case 'remaster':
        return apply('Remastering', (b) => remaster(b, preset), 'remaster');
      case 'extend':
        return apply(
          'Extending with AI',
          (b) => extendWithAI(b, extendSecs, { prompt: aiStyle, trackId: track.id, onStatus: setBusy }),
          'extend'
        );
      case 'replace': {
        if (e - s < 6) {
          setError('Select at least 6 seconds to replace.');
          return;
        }
        if (e - s > 120) {
          setError('Select 2 minutes or less to replace.');
          return;
        }
        return apply(
          'Replacing with AI',
          async (b) => {
            setBusy('Sending the section to the AI');
            const path = await uploadClip(slice(b, s, e), 'replace-section');
            const res = await api.runJob({ kind: 'replace', track_id: track.id, audio_path: path, prompt: aiStyle, lyrics: aiLyrics }, (m) => setBusy(`Replacing: ${m}`));
            const fresh = await decodeFromUrl(res.clip_url);
            return replaceRange(b, s, e, fresh);
          },
          'replace'
        );
      }
      case 'hook':
        setBusy('Saving hook');
        try {
          if (notes.length) {
            setError('Hooks are cut from the saved song. Save this version first, then make the hook from it.');
            return;
          }
          await api.createHook({ track_id: track.id, start_sec: s, end_sec: Math.min(e, s + 60), title: `${track.title} hook` });
          setDone('Hook saved. Find it in Library under Hooks.');
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(null);
        }
        return;
      default:
    }
  };

  const saveVersion = async () => {
    if (!buffer || !track) return;
    setBusy('Saving the new version');
    setError(null);
    preview.stop();
    try {
      const wav = encodeWav(buffer);
      const name = saveTitle.trim() || `${track.title} (${notes.length === 1 ? TOOLS.find((t) => t[0] === notes[0])?.[1] || 'Edited' : 'Edited'})`;
      const file = new File([wav], `${name}.wav`, { type: 'audio/wav' });
      const keepsWords = notes.every((n) => ['remaster', 'fadein', 'fadeout'].includes(n));
      const { track: saved } = await api.uploadTrack(file, {
        title: name,
        source: 'edit',
        parent_id: track.id,
        edit_note: notes.length === 1 ? notes[0] : 'edit',
        tags: track.tags || [],
        lyrics: track.lyrics || null,
        prompt: track.prompt || null,
        artwork_path: track.artwork_path || null,
        workspace_id: track.workspace_id || null,
        instrumental: !!track.instrumental,
        duration: Math.round(buffer.duration * 10) / 10,
        peaks: peaksFromBuffer(buffer),
      });
      if (keepsWords && track.lyrics_synced?.length) await api.updateTrack(saved.id, { lyrics_synced: track.lyrics_synced }).catch(() => {});
      setDone(`Saved “${saved.title}” to your Library.`);
      setTimeout(() => router.push('/library'), 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const toolInfo = TOOLS.find((t) => t[0] === tool) || TOOLS[0];
  const dur = buffer?.duration || 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/library" className="icon-btn" aria-label="Back to Library">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {track && <TrackArt track={track} size={44} />}
        <div className="min-w-0 flex-1">
          <div className="label">Editor</div>
          <h1 className="truncate font-display text-xl font-bold text-white">{track?.title || 'Loading…'}</h1>
        </div>
        <button type="button" className="icon-btn" onClick={undo} disabled={!history.length || !!busy} aria-label="Undo">
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn" onClick={redo} disabled={!future.length || !!busy} aria-label="Redo">
          <Redo2 className="h-4 w-4" />
        </button>
      </header>

      <section className="panel flex flex-col gap-3 p-3 sm:p-4">
        {buffer ? (
          <WaveCanvas buffer={buffer} sel={sel} setSel={setSel} pos={preview.pos} zoom={zoom} onSeek={(t) => { preview.setPos(t); if (preview.playing) preview.play(buffer, t); }} />
        ) : (
          <div className="flex h-[180px] items-center justify-center rounded-xl border border-ink-700 bg-ink-950 text-sm text-ink-400">
            {error ? error : <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the song</>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary rounded-full"
            disabled={!buffer}
            onClick={() => {
              if (globalPlaying) globalToggle();
              if (preview.playing) preview.stop();
              else preview.play(buffer, preview.pos >= dur - 0.1 ? 0 : preview.pos);
            }}
          >
            {preview.playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />} {preview.playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="btn-ghost rounded-full" disabled={!sel} onClick={() => { if (globalPlaying) globalToggle(); preview.play(buffer, sel[0], sel[1]); }}>
            <Play className="h-4 w-4" /> Play selection
          </button>
          <span className="font-mono text-xs tabular-nums text-ink-300">{formatTime(preview.pos)} / {formatTime(dur)}</span>
          {sel && (
            <span className="font-mono text-xs text-gold">
              Selected {formatTime(sel[0])} – {formatTime(sel[1])} ({Math.round(sel[1] - sel[0])}s)
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="icon-btn" onClick={() => setSel(null)} disabled={!sel} aria-label="Clear selection" title="Clear selection">
              <Check className="h-4 w-4" />
            </button>
            <button type="button" className="icon-btn" onClick={() => setZoom((z) => Math.max(1, z / 2))} disabled={zoom <= 1} aria-label="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button type="button" className="icon-btn" onClick={() => setZoom((z) => Math.min(16, z * 2))} aria-label="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="text-xs text-ink-500">Drag across the waveform to select. Drag the gold edges to adjust. Tap once to move the playhead.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Edit tools" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
          {TOOLS.map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTool(k);
                setError(null);
                setDone(null);
                if (NEEDS_SELECTION.includes(k) && !sel && buffer) setSel([dur * 0.35, Math.min(dur, dur * 0.35 + (k === 'hook' ? 15 : 20))]);
              }}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition lg:w-full ${tool === k ? 'bg-ink-800 text-white ring-1 ring-ink-700' : 'text-ink-300 hover:bg-ink-900 hover:text-white'}`}
            >
              <Icon className={`h-4 w-4 ${tool === k ? 'text-gold' : 'text-ink-400'}`} /> {label}
            </button>
          ))}
        </nav>

        <section className="panel flex flex-col gap-4 p-4 sm:p-5">
          <div>
            <h2 className="font-display text-lg font-bold text-white">{toolInfo[1]}</h2>
            <p className="text-sm text-ink-400">{toolInfo[3]}</p>
          </div>

          {tool === 'speed' && (
            <div className="flex flex-col gap-3">
              <label className="block">
                <div className="mb-1 flex justify-between text-sm text-ink-200"><span>Speed</span><span className="font-mono text-gold">{speed}%</span></div>
                <input type="range" min={50} max={150} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full" />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-200">
                <input type="checkbox" checked={keepPitch} onChange={(e) => setKeepPitch(e.target.checked)} className="accent-[#e8b94a]" /> Keep the same key (pitch)
              </label>
            </div>
          )}
          {(tool === 'fadein' || tool === 'fadeout') && (
            <label className="block">
              <div className="mb-1 flex justify-between text-sm text-ink-200"><span>Fade length</span><span className="font-mono text-gold">{fadeSecs}s</span></div>
              <input type="range" min={1} max={20} value={fadeSecs} onChange={(e) => setFadeSecs(Number(e.target.value))} className="w-full" />
            </label>
          )}
          {tool === 'remaster' && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(REMASTER_PRESETS).map(([k, p]) => (
                <button key={k} type="button" onClick={() => setPreset(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${preset === k ? 'bg-white text-ink-950' : 'border border-ink-700 bg-ink-850 text-ink-200'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {tool === 'reverse' && <p className="text-sm text-ink-300">{sel ? 'Reverses only the selected part.' : 'Nothing selected, so the whole song is reversed.'}</p>}
          {tool === 'extend' && (
            <div className="flex flex-col gap-3">
              <label className="block">
                <div className="mb-1 flex justify-between text-sm text-ink-200"><span>Add about</span><span className="font-mono text-gold">{formatTime(extendSecs)} ({Math.ceil(extendSecs / 20)} AI part{extendSecs > 20 ? 's' : ''})</span></div>
                <input type="range" min={10} max={240} step={10} value={extendSecs} onChange={(e) => setExtendSecs(Number(e.target.value))} className="w-full" />
              </label>
              <input className="field" placeholder="Style for the extension (optional)" value={aiStyle} onChange={(e) => setAiStyle(e.target.value)} />
              <p className="text-xs text-ink-500">Up to 4 minutes at a time. The AI adds about 20 seconds per part, each part listening to the newest 10 seconds so it flows. It continues as an instrumental. About 3¢ per part.</p>
            </div>
          )}
          {tool === 'replace' && (
            <div className="flex flex-col gap-3">
              <input className="field" placeholder="Style for the new section" value={aiStyle} onChange={(e) => setAiStyle(e.target.value)} />
              <textarea className="field font-mono text-[13px]" rows={4} placeholder="New lyrics for this part (optional)" value={aiLyrics} onChange={(e) => setAiLyrics(e.target.value)} />
              <p className="text-xs text-ink-500">Select 6 seconds to 2 minutes. The AI keeps the melody and sings that part again. A few cents.</p>
            </div>
          )}
          {NEEDS_SELECTION.includes(tool) && !sel && <p className="text-sm text-neon-amber">Drag across the waveform to choose the part.</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" disabled={!buffer || !!busy} onClick={runTool}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : React_Icon(toolInfo[2])} {tool === 'hook' ? 'Save Hook' : `Apply ${toolInfo[1]}`}
            </button>
            {busy && <span className="text-sm text-gold">{busy}…</span>}
          </div>
          {error && <p className="text-sm text-neon-pink">{error}</p>}
          {done && <p className="text-sm text-neon-cyan">{done}</p>}

          <div className="mt-2 border-t border-ink-800 pt-4">
            <div className="label mb-2">Save</div>
            <div className="flex flex-wrap gap-2">
              <input className="field min-w-0 flex-1" placeholder={track ? `${track.title} (Edited)` : 'Title'} value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} />
              <button type="button" className="btn-primary" disabled={!notes.length || !!busy} onClick={saveVersion}>
                <Save className="h-4 w-4" /> Save as new version
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              {notes.length ? `${notes.length} change${notes.length > 1 ? 's' : ''} so far. Your original stays untouched.` : 'Make a change, then save it as a new version. The original is never overwritten.'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function React_Icon(Icon) {
  return <Icon className="h-4 w-4" />;
}
