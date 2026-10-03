'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Copy,
  Download,
  Headphones,
  Layers,
  Loader2,
  Magnet,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Save,
  Scissors,
  SkipBack,
  Square,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePlayer } from '@/components/PlayerProvider';
import Modal from '@/components/Modal';
import TrackArt from '@/components/TrackArt';
import { decodeFromFile, decodeFromUrl, downloadBlob, encodeWav, formatTime, peaksFromBuffer, safeFilename } from '@/lib/audio';
import { mixdown, slice } from '@/lib/audioEdit';
import { extendWithAI } from '@/lib/aiExtend';

const COLORS = ['#2ee6d6', '#e8b94a', '#ff4fa3', '#9d7bff', '#ffc15e', '#5be37d'];
const LANE_H = 76;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

// Decoded audio, shared across the editor
const bufferCache = new Map();
async function loadBuffer(clip) {
  const key = clip.path;
  if (bufferCache.has(key)) return bufferCache.get(key);
  const p = (async () => {
    const { url } = await api.playUrl(clip.path);
    return decodeFromUrl(url);
  })();
  bufferCache.set(key, p);
  p.catch(() => bufferCache.delete(key));
  return p;
}

function ClipWave({ buffer, offset, duration, width, color }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !buffer || width < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const h = LANE_H - 22;
    c.width = Math.min(8000, width * dpr);
    c.height = h * dpr;
    const g = c.getContext('2d');
    g.scale(c.width / width, dpr);
    // Each pixel column reads its own stretch of audio; past the end of the file it wraps (loop)
    const n = Math.max(2, Math.floor(Math.min(width, 4000)));
    const d0 = buffer.getChannelData(0);
    const d1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : d0;
    const len = buffer.length;
    const rate = buffer.sampleRate;
    const cols = new Float32Array(n * 2);
    let peak = 0.05;
    for (let x = 0; x < n; x++) {
      const a = Math.floor((offset + (x / n) * duration) * rate);
      const b = Math.floor((offset + ((x + 1) / n) * duration) * rate);
      let lo = 0;
      let hi = 0;
      const stride = Math.max(1, Math.floor((b - a) / 200));
      for (let j = a; j < b; j += stride) {
        const k = j % len;
        const v = (d0[k] + d1[k]) / 2;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      cols[x * 2] = lo;
      cols[x * 2 + 1] = hi;
      peak = Math.max(peak, -lo, hi);
    }
    g.fillStyle = color;
    const mid = h / 2;
    for (let x = 0; x < n; x++) {
      const lo = (cols[x * 2] / peak) * (mid - 2);
      const hi = (cols[x * 2 + 1] / peak) * (mid - 2);
      g.fillRect((x / n) * width, mid - hi, Math.max(1, width / n), Math.max(1, hi - lo));
    }
    // Mark where each loop repeat starts
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let t = buffer.duration - offset; t < duration; t += buffer.duration) g.fillRect((t / duration) * width, 0, 1, h);
  }, [buffer, offset, duration, width, color]);
  return <canvas ref={ref} style={{ width, height: LANE_H - 22 }} className="block opacity-80" />;
}

function AddAudioModal({ onClose, onPick }) {
  const [songs, setSongs] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  useEffect(() => {
    api.listTracks().then((r) => setSongs(r.tracks)).catch((e) => setErr(e.message));
  }, []);
  const upload = async (file) => {
    setBusy(true);
    setErr(null);
    try {
      const buf = await decodeFromFile(file);
      const path = await api.uploadAudio(file);
      bufferCache.set(path, Promise.resolve(buf));
      onPick({ path, name: file.name.replace(/\.[^.]+$/, ''), duration: buf.duration });
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  const list = (songs || []).filter((s) => !q.trim() || s.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal title="Add audio" onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <button type="button" className="btn-ghost w-fit" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload an audio file
        </button>
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <input type="search" className="field" placeholder="Search your songs" value={q} onChange={(e) => setQ(e.target.value)} />
        {songs === null ? (
          <p className="flex items-center gap-2 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
        ) : (
          <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {list.map((s) => (
              <li key={s.id} className="rounded-xl px-2 py-2 hover:bg-ink-850">
                <div className="flex items-center gap-3">
                  <TrackArt track={s} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{s.title}</div>
                    <div className="text-xs text-ink-400">{formatTime(s.duration)}</div>
                  </div>
                  <button type="button" className="btn-ghost text-xs" onClick={() => onPick({ trackId: s.id, path: s.audio_path, name: s.title, duration: Number(s.duration) || 0 })}>
                    <Plus className="h-4 w-4" /> Song
                  </button>
                </div>
                {s.stems && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-[52px]">
                    {Object.entries(s.stems).map(([k, path]) => (
                      <button key={k} type="button" className="chip border-ink-700 bg-ink-900 text-ink-200 hover:text-white" onClick={() => onPick({ trackId: s.id, path, name: `${s.title} · ${k}`, duration: Number(s.duration) || 0 })}>
                        <Layers className="h-3 w-3" /> {k}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-500">Tip: use ••• › Edit › Get Stems on a song in your Library to bring in just the vocals, drums, bass or instruments.</p>
        {err && <p className="text-sm text-neon-pink">{err}</p>}
      </div>
    </Modal>
  );
}

export default function StudioEditor({ id }) {
  const { playing: globalPlaying, toggle: globalToggle } = usePlayer();
  const [project, setProject] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [name, setName] = useState('');
  const [buffers, setBuffers] = useState({});
  const [pps, setPps] = useState(12); // pixels per second
  const [snap, setSnap] = useState(true);
  const [selected, setSelected] = useState(null); // { laneId, clipId }
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [addTo, setAddTo] = useState(null); // lane id or 'new'
  const [saving, setSaving] = useState('saved');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const ctxRef = useRef(null);
  const nodesRef = useRef({ sources: [], gains: {} });
  const clockRef = useRef({ at: 0, from: 0 });
  const rafRef = useRef(null);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const loaded = useRef(false);

  // ---------- load ----------
  useEffect(() => {
    api
      .getProject(id)
      .then(({ project }) => {
        setProject(project);
        setName(project.name);
        setTracks(project.data?.tracks || []);
        loaded.current = true;
      })
      .catch((e) => setError(e.message));
  }, [id]);

  // decode every clip's audio
  useEffect(() => {
    for (const lane of tracks)
      for (const c of lane.clips || []) {
        if (buffers[c.path] !== undefined) continue;
        setBuffers((b) => ({ ...b, [c.path]: null }));
        loadBuffer(c)
          .then((buf) => {
            setBuffers((b) => ({ ...b, [c.path]: buf }));
            // fill in unknown lengths
            setTracks((ts) =>
              ts.map((l) => ({
                ...l,
                clips: (l.clips || []).map((x) => (x.path === c.path && !x.duration ? { ...x, duration: buf.duration } : x)),
              }))
            );
          })
          .catch(() => setBuffers((b) => ({ ...b, [c.path]: false })));
      }
  }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- autosave ----------
  useEffect(() => {
    if (!loaded.current || !project) return;
    setSaving('saving');
    const t = setTimeout(() => {
      api
        .saveProject(id, { name, data: { tracks } })
        .then(() => setSaving('saved'))
        .catch(() => setSaving('error'));
    }, 1200);
    return () => clearTimeout(t);
  }, [tracks, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const length = useMemo(() => {
    let end = 0;
    for (const l of tracks) for (const c of l.clips || []) end = Math.max(end, c.start + (c.duration || 0));
    return end;
  }, [tracks]);
  const viewSecs = Math.max(60, length + 30);

  const anySolo = tracks.some((l) => l.solo);
  const laneGain = (l) => (l.muted || (anySolo && !l.solo) ? 0 : l.volume ?? 1);

  // ---------- transport ----------
  const stopNodes = () => {
    for (const s of nodesRef.current.sources) {
      try {
        s.stop();
      } catch {}
    }
    nodesRef.current = { sources: [], gains: {} };
    cancelAnimationFrame(rafRef.current);
  };

  const pause = useCallback(() => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current;
    const pos = clockRef.current.from + (ctx.currentTime - clockRef.current.at);
    stopNodes();
    setPlaying(false);
    setPlayhead(Math.max(0, pos));
  }, []);

  const play = (from = playhead) => {
    if (globalPlaying) globalToggle();
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = ctxRef.current;
    ctx.resume();
    stopNodes();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    const sources = [];
    const gains = {};
    const t0 = ctx.currentTime + 0.05;
    for (const l of tracks) {
      const g = ctx.createGain();
      g.gain.value = laneGain(l);
      g.connect(master);
      gains[l.id] = g;
      for (const c of l.clips || []) {
        const buf = buffers[c.path];
        if (!buf) continue;
        const end = c.start + c.duration;
        if (end <= from) continue;
        const skip = Math.max(0, from - c.start);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        const loops = (c.offset || 0) + c.duration > buf.duration + 0.02;
        if (loops) {
          src.loop = true;
          src.loopStart = 0;
          src.loopEnd = buf.duration;
        }
        src.start(t0 + Math.max(0, c.start - from), ((c.offset || 0) + skip) % buf.duration, Math.max(0.01, c.duration - skip));
        sources.push(src);
      }
    }
    nodesRef.current = { sources, gains };
    clockRef.current = { at: t0, from };
    setPlaying(true);
    const tick = () => {
      const pos = clockRef.current.from + Math.max(0, ctx.currentTime - clockRef.current.at);
      setPlayhead(pos);
      if (pos > length + 0.5) {
        stopNodes();
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  useEffect(() => () => stopNodes(), []);

  // live volume / mute / solo
  useEffect(() => {
    for (const l of tracks) {
      const g = nodesRef.current.gains[l.id];
      if (g) g.gain.value = laneGain(l);
    }
  }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = (t) => {
    const was = playing;
    if (was) pause();
    setPlayhead(Math.max(0, t));
    if (was) setTimeout(() => play(Math.max(0, t)), 0);
  };

  // spacebar
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        playing ? pause() : play();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        deleteClip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- edits ----------
  const updateLane = (laneId, patch) => setTracks((ts) => ts.map((l) => (l.id === laneId ? { ...l, ...patch } : l)));
  const updateClip = (laneId, clipId, patch) =>
    setTracks((ts) => ts.map((l) => (l.id === laneId ? { ...l, clips: l.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) } : l)));

  const addClip = (picked) => {
    const clip = { id: uid(), trackId: picked.trackId || null, path: picked.path, name: picked.name, start: 0, offset: 0, duration: picked.duration || 0 };
    if (addTo === 'new' || !tracks.length) {
      setTracks((ts) => [...ts, { id: uid(), name: picked.name, volume: 1, muted: false, solo: false, clips: [{ ...clip, start: 0 }] }]);
    } else {
      setTracks((ts) =>
        ts.map((l) => {
          if (l.id !== addTo) return l;
          const end = Math.max(0, ...(l.clips || []).map((c) => c.start + c.duration));
          return { ...l, clips: [...(l.clips || []), { ...clip, start: end }] };
        })
      );
    }
    setAddTo(null);
  };

  const selClip = () => {
    if (!selected) return null;
    const lane = tracks.find((l) => l.id === selected.laneId);
    return lane?.clips.find((c) => c.id === selected.clipId) || null;
  };

  const deleteClip = () => {
    if (!selected) return;
    setTracks((ts) => ts.map((l) => (l.id === selected.laneId ? { ...l, clips: l.clips.filter((c) => c.id !== selected.clipId) } : l)));
    setSelected(null);
  };

  const duplicateClip = () => {
    const c = selClip();
    if (!c) return;
    const copy = { ...c, id: uid(), start: c.start + c.duration };
    setTracks((ts) => ts.map((l) => (l.id === selected.laneId ? { ...l, clips: [...l.clips, copy] } : l)));
    setSelected({ laneId: selected.laneId, clipId: copy.id });
  };

  const splitClip = () => {
    const c = selClip();
    if (!c) return;
    const at = playhead - c.start;
    if (at <= 0.05 || at >= c.duration - 0.05) {
      setNotice('Move the playhead inside the selected clip, then split.');
      setTimeout(() => setNotice(null), 2500);
      return;
    }
    const a = { ...c, duration: at };
    const b = { ...c, id: uid(), start: c.start + at, offset: (c.offset || 0) + at, duration: c.duration - at };
    setTracks((ts) => ts.map((l) => (l.id === selected.laneId ? { ...l, clips: l.clips.flatMap((x) => (x.id === c.id ? [a, b] : [x])) } : l)));
  };

  // Add one more repeat of the clip's audio to its end
  const loopClip = () => {
    const c = selClip();
    const buf = c && buffers[c.path];
    if (!buf) return;
    updateClip(selected.laneId, c.id, { duration: Math.min(1200, c.duration + (buf.duration - (c.offset || 0))) });
  };

  const [extendOpen, setExtendOpen] = useState(false);
  const [extendSecs, setExtendSecs] = useState(60);
  const [extendStyle, setExtendStyle] = useState('');
  const aiExtendClip = async () => {
    const c = selClip();
    const buf = c && buffers[c.path];
    if (!buf) return;
    const laneId = selected.laneId;
    setExtendOpen(false);
    setError(null);
    pause();
    try {
      setBusy('Getting the clip ready');
      // What you hear in the clip, loops included
      const loops = (c.offset || 0) + c.duration > buf.duration + 0.02;
      const visible = loops
        ? await mixdown([{ buffer: buf, start: 0, offset: c.offset || 0, duration: c.duration, gain: 1, loop: true }], c.duration)
        : slice(buf, c.offset || 0, (c.offset || 0) + c.duration);
      const longer = await extendWithAI(visible, extendSecs, { prompt: extendStyle, trackId: c.trackId, onStatus: setBusy });
      setBusy('Saving the longer clip');
      const path = await api.uploadAudio(new File([encodeWav(longer)], `${safeFilename(c.name)}-extended.wav`, { type: 'audio/wav' }));
      bufferCache.set(path, Promise.resolve(longer));
      setBuffers((b) => ({ ...b, [path]: longer }));
      updateClip(laneId, c.id, { path, offset: 0, duration: longer.duration, name: `${c.name} (extended)` });
      setNotice(`Clip is now ${formatTime(longer.duration)} long.`);
      setTimeout(() => setNotice(null), 3500);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const snapT = (t) => (snap ? Math.round(t * 4) / 4 : t);

  // drag / trim clips
  const onClipDown = (e, lane, clip, mode) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setSelected({ laneId: lane.id, clipId: clip.id });
    dragRef.current = { x: e.clientX, laneId: lane.id, clip: { ...clip }, mode };
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dt = (e.clientX - d.x) / pps;
    const c = d.clip;
    const buf = buffers[c.path];
    if (d.mode === 'move') updateClip(d.laneId, c.id, { start: Math.max(0, snapT(c.start + dt)) });
    if (d.mode === 'left') {
      const shift = Math.max(-c.offset, Math.min(c.duration - 0.2, snapT(dt)));
      updateClip(d.laneId, c.id, { start: Math.max(0, c.start + shift), offset: c.offset + shift, duration: c.duration - shift });
    }
    if (d.mode === 'right') updateClip(d.laneId, c.id, { duration: Math.max(0.2, Math.min(1200, snapT(c.duration + dt))) });
  };
  const onUp = () => {
    dragRef.current = null;
  };

  // ---------- export ----------
  const render = async () => {
    const items = [];
    for (const l of tracks) {
      const gain = laneGain(l);
      if (!gain) continue;
      for (const c of l.clips || []) {
        const buf = buffers[c.path] || (await loadBuffer(c));
        items.push({ buffer: buf, start: c.start, offset: c.offset || 0, duration: c.duration, gain, loop: (c.offset || 0) + c.duration > buf.duration + 0.02 });
      }
    }
    if (!items.length) throw new Error('Add some audio first.');
    return mixdown(items, length + 0.5);
  };

  const exportToLibrary = async () => {
    setBusy('Mixing down');
    setError(null);
    try {
      const mix = await render();
      setBusy('Saving to your Library');
      const first = tracks.flatMap((l) => l.clips || []).find((c) => c.trackId);
      let parent = null;
      if (first) parent = (await api.getTrack(first.trackId).catch(() => ({}))).track || null;
      const file = new File([encodeWav(mix)], `${safeFilename(name)}.wav`, { type: 'audio/wav' });
      await api.uploadTrack(file, {
        title: name || 'Studio mix',
        source: 'studio',
        edit_note: 'studio',
        parent_id: parent?.id || null,
        artwork_path: parent?.artwork_path || null,
        tags: parent?.tags || [],
        lyrics: parent?.lyrics || null,
        duration: Math.round(mix.duration * 10) / 10,
        peaks: peaksFromBuffer(mix),
      });
      setNotice('Saved to your Library.');
      setTimeout(() => setNotice(null), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const exportFile = async () => {
    setBusy('Mixing down');
    setError(null);
    try {
      downloadBlob(encodeWav(await render()), `${safeFilename(name)}.wav`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (error && !project) return <p className="py-20 text-center text-ink-400">{error}</p>;
  if (!project) return <p className="flex justify-center py-20 text-ink-400"><Loader2 className="h-5 w-5 animate-spin" /></p>;

  const width = viewSecs * pps;
  const tickEvery = pps >= 40 ? 1 : pps >= 16 ? 5 : pps >= 6 ? 10 : 30;
  const sc = selClip();

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-4" onPointerMove={onMove} onPointerUp={onUp}>
      <header className="flex flex-wrap items-center gap-2">
        <Link href="/studio" className="icon-btn" aria-label="Back to Studio">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <input aria-label="Project name" className="min-w-0 flex-1 bg-transparent font-display text-xl font-bold text-white outline-none focus:underline sm:flex-none sm:w-80" value={name} onChange={(e) => setName(e.target.value)} />
        <span className="text-xs text-ink-500">{saving === 'saving' ? 'Saving…' : saving === 'error' ? 'Not saved' : 'Saved'}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-ghost rounded-full" onClick={exportFile} disabled={!!busy || !length}>
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export WAV</span>
          </button>
          <button type="button" className="btn-primary rounded-full" onClick={exportToLibrary} disabled={!!busy || !length}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} <span className="sm:hidden">Save</span><span className="hidden sm:inline">Save to Library</span>
          </button>
        </div>
      </header>

      {/* Transport */}
      <div className="panel flex flex-wrap items-center gap-2 p-2.5">
        <button type="button" className="icon-btn" onClick={() => seek(0)} aria-label="Back to start">
          <SkipBack className="h-4 w-4" />
        </button>
        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-950" onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause' : 'Play'} disabled={!length}>
          {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
        </button>
        <button type="button" className="icon-btn" onClick={() => { pause(); setPlayhead(0); }} aria-label="Stop">
          <Square className="h-4 w-4" />
        </button>
        <span className="font-mono text-sm tabular-nums text-white">{formatTime(playhead)}<span className="text-ink-500"> / {formatTime(length)}</span></span>
        <div className="mx-2 h-6 w-px bg-ink-700" />
        <button type="button" className="btn-ghost h-9 rounded-full text-xs" disabled={!sc} onClick={splitClip}>
          <Scissors className="h-4 w-4" /> Split
        </button>
        <button type="button" className="btn-ghost h-9 rounded-full text-xs" disabled={!sc} onClick={duplicateClip}>
          <Copy className="h-4 w-4" /> Duplicate
        </button>
        <button type="button" className="btn-ghost h-9 rounded-full text-xs" disabled={!sc} onClick={deleteClip}>
          <Trash2 className="h-4 w-4" /> Delete
        </button>
        <button type="button" className="btn-ghost h-9 rounded-full text-xs" disabled={!sc || !!busy} onClick={loopClip} title="Repeat the clip once more">
          <Repeat className="h-4 w-4" /> Loop
        </button>
        <button type="button" className="btn-ghost h-9 rounded-full text-xs !border-gold/50 !text-gold" disabled={!sc || !!busy} onClick={() => { setExtendStyle(''); setExtendOpen(true); }}>
          <Sparkles className="h-4 w-4" /> AI Extend
        </button>
        <button type="button" className={`btn-ghost h-9 rounded-full text-xs ${snap ? '!border-gold/60 !text-gold' : ''}`} onClick={() => setSnap((s) => !s)} aria-pressed={snap}>
          <Magnet className="h-4 w-4" /> Snap
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="icon-btn" onClick={() => setPps((p) => Math.max(3, p / 1.5))} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" className="icon-btn" onClick={() => setPps((p) => Math.min(120, p * 1.5))} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>
      {(notice || busy || error) && (
        <p className={`text-sm ${error ? 'text-neon-pink' : 'text-gold'}`}>{error || (busy ? `${busy}…` : notice)}</p>
      )}

      {/* Timeline */}
      <div className="panel flex overflow-hidden">
        {/* lane headers */}
        <div className="w-[8.5rem] shrink-0 border-r border-ink-800 sm:w-52">
          <div className="h-7 border-b border-ink-800" />
          {tracks.map((l, i) => (
            <div key={l.id} className="flex flex-col justify-center gap-1 border-b border-ink-800 px-2" style={{ height: LANE_H }}>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <input aria-label="Track name" className="min-w-0 flex-1 truncate bg-transparent text-xs font-semibold text-white outline-none" value={l.name} onChange={(e) => updateLane(l.id, { name: e.target.value })} />
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className={`h-6 w-6 rounded text-[10px] font-bold ${l.muted ? 'bg-neon-pink text-ink-950' : 'bg-ink-800 text-ink-300'}`} onClick={() => updateLane(l.id, { muted: !l.muted })} aria-label="Mute" aria-pressed={l.muted}>
                  M
                </button>
                <button type="button" className={`h-6 w-6 rounded text-[10px] font-bold ${l.solo ? 'bg-gold text-ink-950' : 'bg-ink-800 text-ink-300'}`} onClick={() => updateLane(l.id, { solo: !l.solo })} aria-label="Solo" aria-pressed={l.solo}>
                  S
                </button>
                <input type="range" min={0} max={1.5} step={0.01} value={l.volume ?? 1} onChange={(e) => updateLane(l.id, { volume: Number(e.target.value) })} aria-label="Volume" className="hidden w-16 sm:block" />
                <button type="button" className="icon-btn h-6 w-6" onClick={() => setAddTo(l.id)} aria-label="Add audio to this track">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="icon-btn h-6 w-6"
                  aria-label="Delete track"
                  onClick={() => window.confirm(`Remove the track "${l.name}"?`) && setTracks((ts) => ts.filter((x) => x.id !== l.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="flex w-full items-center gap-2 px-3 py-3 text-xs font-semibold text-ink-300 hover:text-white" onClick={() => setAddTo('new')}>
            <Plus className="h-4 w-4" /> Add track
          </button>
        </div>

        {/* lanes */}
        <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-x-auto">
          <div style={{ width }} className="relative">
            {/* ruler */}
            <div
              className="relative h-7 cursor-pointer border-b border-ink-800 bg-ink-900"
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seek((e.clientX - r.left) / pps);
              }}
            >
              {Array.from({ length: Math.ceil(viewSecs / tickEvery) + 1 }, (_, i) => i * tickEvery).map((t) => (
                <span key={t} className="absolute top-0 h-full border-l border-ink-700 pl-1 font-mono text-[10px] text-ink-500" style={{ left: t * pps }}>
                  {formatTime(t)}
                </span>
              ))}
            </div>
            {tracks.map((l, i) => (
              <div
                key={l.id}
                className="relative border-b border-ink-800 bg-ink-950/40"
                style={{ height: LANE_H }}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  setSelected(null);
                  const r = e.currentTarget.getBoundingClientRect();
                  seek((e.clientX - r.left) / pps);
                }}
              >
                {(l.clips || []).map((c) => {
                  const isSel = selected?.clipId === c.id;
                  const color = COLORS[i % COLORS.length];
                  const w = Math.max(8, c.duration * pps);
                  const buf = buffers[c.path];
                  return (
                    <div
                      key={c.id}
                      className={`absolute top-1.5 overflow-hidden rounded-lg border ${isSel ? 'border-white ring-2 ring-white/40' : 'border-transparent'}`}
                      style={{ left: c.start * pps, width: w, height: LANE_H - 12, background: `${color}26`, touchAction: 'none' }}
                      onPointerDown={(e) => onClipDown(e, l, c, 'move')}
                    >
                      <div className="flex h-4 items-center truncate px-1.5 text-[10px] font-semibold" style={{ background: `${color}55`, color: '#fff' }}>
                        {c.name}
                      </div>
                      {buf ? (
                        <ClipWave buffer={buf} offset={c.offset || 0} duration={c.duration} width={w} color={color} />
                      ) : (
                        <div className="flex h-[54px] items-center px-2 text-[10px] text-ink-400">{buf === false ? 'Could not load' : 'Loading…'}</div>
                      )}
                      <span className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-white/30" onPointerDown={(e) => onClipDown(e, l, c, 'left')} />
                      <span className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-white/30" onPointerDown={(e) => onClipDown(e, l, c, 'right')} />
                    </div>
                  );
                })}
              </div>
            ))}
            {!tracks.length && (
              <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
                <Music2 className="h-6 w-6 text-ink-500" />
                <button type="button" className="btn-primary rounded-full" onClick={() => setAddTo('new')}>
                  <Plus className="h-4 w-4" /> Add a song, stem or audio file
                </button>
              </div>
            )}
            {/* playhead */}
            <div className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-neon-cyan" style={{ left: playhead * pps }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1"><Headphones className="h-3.5 w-3.5" /> Space bar plays and pauses.</span>
        <span>Drag clips to move them. Drag their edges to trim; drag the right edge past the end to loop. Select a clip and press Delete to remove it.</span>
        {sc && (
          <span className="inline-flex items-center gap-1 text-ink-300">
            <Volume2 className="h-3.5 w-3.5" /> {sc.name}: starts {formatTime(sc.start)}, {formatTime(sc.duration)} long
          </span>
        )}
        {anySolo && <span className="inline-flex items-center gap-1 text-gold"><VolumeX className="h-3.5 w-3.5" /> Solo is on</span>}
      </div>

      {addTo && <AddAudioModal onClose={() => setAddTo(null)} onPick={addClip} />}
      {extendOpen && sc && (
        <Modal
          title="Extend with AI"
          onClose={() => setExtendOpen(false)}
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setExtendOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={aiExtendClip}>
                <Sparkles className="h-4 w-4" /> Extend {formatTime(extendSecs)}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-300">“{sc.name}” keeps going for as long as you choose. The AI adds about 20 seconds per part, each part listening to the newest 10 seconds so it flows. About 3¢ per part.</p>
            <label className="block">
              <div className="mb-1 flex justify-between text-sm text-ink-200"><span>Add</span><span className="font-mono text-gold">{formatTime(extendSecs)} ({Math.ceil(extendSecs / 20)} parts)</span></div>
              <input type="range" min={20} max={240} step={20} value={extendSecs} onChange={(e) => setExtendSecs(Number(e.target.value))} className="w-full" />
            </label>
            <input className="field" placeholder="Style for the new part (optional), e.g. add drums, sax solo" value={extendStyle} onChange={(e) => setExtendStyle(e.target.value)} />
            <p className="text-xs text-ink-500">For free, use Loop instead, or drag the clip's right edge past its end and it repeats.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
