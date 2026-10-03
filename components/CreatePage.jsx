'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ChevronDown,
  Dices,
  FolderPlus,
  Loader2,
  Mic,
  Music4,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import SongRow from '@/components/SongRow';
import TrackArt from '@/components/TrackArt';
import { useSongActions } from '@/components/SongActions';
import { decodeFromFile, encodeWav, formatTime } from '@/lib/audio';

const STYLE_SUGGESTIONS = [
  'R&B', 'Neo-Soul', 'Hip-Hop', 'Boom Bap', 'Trap', 'Smooth Jazz', 'Sax', 'Gospel', 'Soul', 'Funk', 'Pop', 'Afrobeats',
  'Amapiano', 'House', 'Reggae', 'Lo-fi', 'Cinematic', 'Ballad', 'Late night', 'Romantic', 'Uplifting', 'Heartfelt',
  'Male vocals', 'Female vocals', 'Harmonies', 'Piano', 'Strings', '808', 'Rhodes', 'Acoustic guitar', '90s', 'Slow tempo',
];
const SECTIONS = ['[Intro]', '[Verse]', '[Pre-Chorus]', '[Chorus]', '[Hook]', '[Bridge]', '[Outro]'];
const LIMIT = { lyrics: 3500, cover: 3000, ref: 350, styles: 1000 };

const REMIX_INFO = {
  cover: { title: 'Cover', blurb: 'Keeps the melody of this song and sings it in a new style. Change the lyrics too if you want.' },
  reuse: { title: 'Reuse Prompt', blurb: 'The styles and lyrics from this song are loaded below. Change anything and create.' },
  mashup: { title: 'Mashup', blurb: "Blends this song's melody with another song's style and lyrics." },
  sample: { title: 'Sample this song', blurb: 'Pick a stretch of the song and the AI builds a new instrumental from it.' },
  inspiration: { title: 'Use as Inspiration', blurb: 'Makes a new song with the feel of this one. This mode makes up to 60 seconds.' },
  voice: { title: 'Voice', blurb: 'Record or upload 15+ seconds of your voice and the AI sings new lyrics in that voice. Up to 60 seconds.' },
};

const JOBS_KEY = 'sp-create-jobs';
const readJobs = () => {
  try {
    return JSON.parse(localStorage.getItem(JOBS_KEY) || '[]');
  } catch {
    return [];
  }
};
const writeJobs = (jobs) => {
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.filter((j) => !['failed', 'canceled'].includes(j.status))));
  } catch {}
};

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="inline-flex items-center gap-2 text-sm text-ink-200">
      <span className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition ${on ? 'bg-gold' : 'bg-ink-600'}`}>
        <span className={`h-4 w-4 rounded-full bg-white transition ${on ? 'translate-x-4' : ''}`} />
      </span>
      {label}
    </button>
  );
}

function Section({ title, right, children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-ink-700 bg-ink-850/70 p-3 sm:p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function Slider({ label, value, onChange, hint }) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-xs text-ink-300">
        <span>{label}</span>
        <span className="font-mono text-ink-400">{value}%</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      {hint && <div className="mt-0.5 text-[11px] text-ink-500">{hint}</div>}
    </label>
  );
}

// Record a voice sample in the browser, or pick a file. Always ends up as WAV for the AI.
function VoicePicker({ value, onChange }) {
  const [rec, setRec] = useState(null);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  const toWavPath = async (blob, name) => {
    setBusy(true);
    setErr(null);
    try {
      const buf = await decodeFromFile(blob);
      if (buf.duration < 15) throw new Error(`That sample is ${Math.round(buf.duration)} seconds. It needs at least 15.`);
      const wav = encodeWav(buf);
      const path = await api.uploadAudio(new File([wav], `${name || 'voice'}.wav`, { type: 'audio/wav' }));
      onChange({ path, seconds: buf.duration, url: URL.createObjectURL(wav) });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        toWavPath(new Blob(chunks, { type: mr.mimeType }), 'voice-recording');
      };
      mr.start();
      setSecs(0);
      const t0 = Date.now();
      const timer = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
      setRec({ mr, timer });
    } catch {
      setErr('The browser could not use the microphone. Allow microphone access, or upload a file instead.');
    }
  };
  const stop = () => {
    clearInterval(rec.timer);
    rec.mr.stop();
    setRec(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {rec ? (
          <button type="button" className="btn-ghost !border-neon-pink/60 !text-neon-pink" onClick={stop}>
            <Square className="h-4 w-4" fill="currentColor" /> Stop ({secs}s)
          </button>
        ) : (
          <button type="button" className="btn-ghost" onClick={start} disabled={busy}>
            <Mic className="h-4 w-4" /> Record my voice
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy || !!rec}>
          <Upload className="h-4 w-4" /> Upload a sample
        </button>
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && toWavPath(e.target.files[0], 'voice')} />
      </div>
      {busy && <p className="flex items-center gap-2 text-xs text-ink-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving the sample</p>}
      {value && !busy && (
        <div className="flex items-center gap-2 text-xs text-ink-300">
          <audio controls src={value.url} className="h-8 max-w-full" />
          <span>{Math.round(value.seconds)}s</span>
        </div>
      )}
      {rec && <p className="text-xs text-ink-400">Sing or rap a few lines. 15 to 60 seconds works best.</p>}
      {err && <p className="text-xs text-neon-pink">{err}</p>}
    </div>
  );
}

function JobCard({ job, onDismiss }) {
  const failed = job.status === 'failed' || job.status === 'canceled';
  return (
    <li className={`flex items-center gap-3 rounded-2xl border p-2.5 ${failed ? 'border-neon-pink/40 bg-neon-pink/5' : 'border-ink-700 bg-ink-850'}`}>
      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${failed ? 'bg-neon-pink/15 text-neon-pink' : 'bg-gold/10 text-gold'}`}>
        {failed ? <AlertCircle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{job.title}</div>
        <div className="truncate text-xs text-ink-400">
          {failed ? job.error || 'Could not finish' : job.note || (job.status === 'processing' ? 'Making your song' : 'Warming up the AI')}
          {!failed && job.startedAt && <span className="font-mono"> · {formatTime((Date.now() - job.startedAt) / 1000)}</span>}
        </div>
      </div>
      {failed && (
        <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

export default function CreatePage() {
  const router = useRouter();
  const params = useSearchParams();
  const remix = params.get('remix');
  const fromId = params.get('from');

  const [mode, setMode] = useState('custom'); // simple | custom
  const [model, setModel] = useState('song'); // song | instrumental (quick beat)
  const [description, setDescription] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [styles, setStyles] = useState('');
  const [exclude, setExclude] = useState('');
  const [vocal, setVocal] = useState(''); // '' | male | female
  const [weirdness, setWeirdness] = useState(50);
  const [influence, setInfluence] = useState(50);
  const [title, setTitle] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [versions, setVersions] = useState(1);
  const [beatSeconds, setBeatSeconds] = useState(30);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lyricIdea, setLyricIdea] = useState('');
  const [writing, setWriting] = useState(false);

  const [source, setSource] = useState(null); // remix source song
  const [second, setSecond] = useState(null); // mashup partner
  const [sampleRange, setSampleRange] = useState([0, 15]);
  const [voice, setVoice] = useState(null);

  const [songs, setSongs] = useState([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [workspaceId, setWorkspaceId] = useState('');
  const [search, setSearch] = useState('');
  const [jobs, setJobs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [, tick] = useState(0);
  const lyricsRef = useRef(null);

  const { actions, modals } = useSongActions({
    onUpdate: (t) => setSongs((s) => s.map((x) => (x.id === t.id ? { ...x, ...t } : x))),
    onRemove: (t) => setSongs((s) => s.filter((x) => x.id !== t.id)),
  });

  const loadSongs = useCallback(async () => {
    setLoadingSongs(true);
    try {
      const { tracks } = await api.listTracks();
      setSongs(tracks);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingSongs(false);
    }
  }, []);

  useEffect(() => {
    loadSongs();
    setJobs(readJobs());
  }, [loadSongs]);

  // Load the remix source song and prefill the form
  useEffect(() => {
    if (!fromId) {
      setSource(null);
      return;
    }
    api
      .getTrack(fromId)
      .then(({ track }) => {
        setSource(track);
        setMode('custom');
        setModel('song');
        setStyles((track.tags || []).join(', ') || track.prompt || '');
        if (remix === 'reuse' || remix === 'cover') {
          setLyrics(track.lyrics || '');
          setInstrumental(!!track.instrumental);
          setTitle(remix === 'reuse' ? track.title : `${track.title} (Cover)`);
          if (remix === 'cover') setStyles('');
        }
        if (remix === 'inspiration' || remix === 'voice') setLyrics('');
        if (remix === 'sample') {
          const d = Number(track.duration) || 30;
          const s = Math.max(0, Math.min(d - 15, d * 0.3));
          setSampleRange([Math.round(s), Math.round(Math.min(d, s + 15))]);
          setStyles('');
        }
        if (remix === 'mashup') {
          setLyrics('');
          setStyles('');
          setTitle(`${track.title} (Mashup)`);
        }
      })
      .catch((e) => setError(e.message));
  }, [fromId, remix]);

  // Clock for job timers + polling
  const pending = jobs.filter((j) => !['succeeded', 'failed', 'canceled'].includes(j.status));
  useEffect(() => {
    if (!pending.length) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [pending.length]);

  useEffect(() => {
    if (!pending.length) return;
    let alive = true;
    const t = setTimeout(async () => {
      for (const job of pending) {
        try {
          const res = await api.pollGeneration(job.id);
          if (!alive) return;
          if (res.status === 'succeeded' && res.track) {
            setSongs((s) => [res.track, ...s.filter((x) => x.id !== res.track.id)]);
            setJobs((js) => {
              const next = js.filter((j) => j.id !== job.id);
              writeJobs(next);
              return next;
            });
          } else {
            setJobs((js) => {
              const next = js.map((j) => (j.id === job.id ? { ...j, status: res.status, error: res.error } : j));
              writeJobs(next);
              return next;
            });
          }
        } catch {}
      }
    }, 4000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const lyricLimit = remix === 'inspiration' || remix === 'voice' ? LIMIT.ref : remix === 'cover' || remix === 'mashup' ? LIMIT.cover : LIMIT.lyrics;

  const addStyle = (s) =>
    setStyles((cur) => {
      const parts = cur.split(',').map((x) => x.trim()).filter(Boolean);
      if (parts.some((p) => p.toLowerCase() === s.toLowerCase())) return cur;
      return [...parts, s].join(', ').slice(0, LIMIT.styles);
    });

  const insertSection = (s) => {
    const el = lyricsRef.current;
    const pos = el ? el.selectionStart : lyrics.length;
    const before = lyrics.slice(0, pos);
    const br = before && !before.endsWith('\n') ? '\n' : '';
    setLyrics(`${before}${br}${s}\n${lyrics.slice(pos)}`.slice(0, lyricLimit));
    requestAnimationFrame(() => el?.focus());
  };

  const fullPrompt = useMemo(() => {
    const parts = [styles.trim()];
    if (vocal && !instrumental) parts.push(`${vocal} vocals`);
    if (weirdness >= 70) parts.push('experimental, unexpected and creative');
    else if (weirdness <= 25) parts.push('classic, familiar, radio-friendly');
    if (influence >= 75) parts.push('stay strictly in this style');
    if (exclude.trim()) parts.push(`avoid ${exclude.trim()}`);
    return parts.filter(Boolean).join('. ');
  }, [styles, vocal, instrumental, weirdness, influence, exclude]);

  const writeLyrics = async () => {
    const idea = lyricIdea.trim() || description.trim() || [title, styles].filter(Boolean).join(', ');
    if (!idea) {
      setError('Type what the song is about in the box next to Write Lyrics.');
      return;
    }
    setWriting(true);
    setError(null);
    try {
      const res = await api.writeLyrics(idea);
      setLyrics(res.lyrics.slice(0, lyricLimit));
      if (!title && res.title) setTitle(res.title);
    } catch (e) {
      setError(e.message);
    } finally {
      setWriting(false);
    }
  };

  const addJob = (res, note) => {
    setJobs((js) => {
      const next = [{ id: res.id, title: res.title, status: res.status || 'starting', startedAt: Date.now(), note }, ...js];
      writeJobs(next);
      return next;
    });
  };

  const create = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const base = { workspace_id: workspaceId || null, title: title.trim() };
      const runs = [];

      if (remix && source && remix !== 'reuse') {
        const tags = (source.tags || []).slice(0, 6);
        if (remix === 'cover') runs.push({ kind: 'cover', track_id: source.id, prompt: fullPrompt, lyrics, tags });
        if (remix === 'mashup') {
          if (!second) throw new Error('Pick the second song for the mashup.');
          runs.push({
            kind: 'mashup',
            track_id: source.id,
            prompt: fullPrompt || (second.tags || []).join(', ') || second.prompt || '',
            lyrics: lyrics || second.lyrics || '',
            tags: [...new Set([...(source.tags || []), ...(second.tags || [])])].slice(0, 8),
          });
        }
        if (remix === 'sample')
          runs.push({ kind: 'sample', track_id: source.id, start: sampleRange[0], end: sampleRange[1], prompt: fullPrompt, duration: 30, tags });
        if (remix === 'inspiration') runs.push({ kind: 'inspiration', track_id: source.id, lyrics, tags });
        if (remix === 'voice') {
          if (!voice) throw new Error('Record or upload your voice sample first.');
          runs.push({ kind: 'voice', track_id: source.id, voice_path: voice.path, lyrics, tags });
        }
      } else if (mode === 'simple') {
        if (description.trim().length < 3) throw new Error('Describe the song you want.');
        let words = '';
        let autoTitle = '';
        if (!instrumental) {
          try {
            const res = await api.writeLyrics(description);
            words = res.lyrics;
            autoTitle = res.title;
          } catch {
            // The song model can write its own lyrics if the lyric writer is busy
          }
        }
        for (let i = 0; i < versions; i++)
          runs.push({ kind: 'song', prompt: description.trim(), lyrics: words.slice(0, LIMIT.lyrics), instrumental, title: base.title || autoTitle, tags: [] });
      } else if (model === 'instrumental') {
        if (fullPrompt.length < 3) throw new Error('Add some styles for the beat.');
        for (let i = 0; i < versions; i++) runs.push({ kind: 'instrumental', prompt: fullPrompt, duration: beatSeconds, tags: styles.split(',').map((s) => s.trim()).filter(Boolean) });
      } else {
        if (fullPrompt.length < 3) throw new Error('Add some styles (genre, mood, instruments).');
        if (!instrumental && lyrics.trim().length < 10 && !window.confirm('No lyrics yet. Let the AI write them?')) return;
        for (let i = 0; i < versions; i++)
          runs.push({ kind: 'song', prompt: fullPrompt, lyrics: instrumental ? '' : lyrics, instrumental, tags: styles.split(',').map((s) => s.trim()).filter(Boolean) });
      }

      for (const body of runs) {
        const res = await api.generate({ ...base, ...body, title: body.title || base.title });
        addJob(res, REMIX_INFO[body.kind] ? `${REMIX_INFO[body.kind].title} in progress` : null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const clearAll = () => {
    setDescription('');
    setLyrics('');
    setStyles('');
    setExclude('');
    setTitle('');
    setVocal('');
    setInstrumental(false);
    setError(null);
    if (remix) router.replace('/create');
  };

  const surprise = () => {
    const pick = (n) => [...STYLE_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, n);
    if (mode === 'simple') setDescription(`A ${pick(1)[0].toLowerCase()} song about ${['second chances', 'a late night drive', 'falling in love again', 'my hometown', 'never giving up', 'summer in the city'][Math.floor(Math.random() * 6)]}`);
    else setStyles(pick(4).join(', '));
  };

  const visible = songs
    .filter((s) => (workspaceId ? s.workspace_id === workspaceId : true))
    .filter((s) => !search.trim() || [s.title, ...(s.tags || [])].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  const createWorkspace = async () => {
    const name = window.prompt('Workspace name');
    if (!name?.trim()) return;
    try {
      const { workspace } = await api.createWorkspace(name.trim());
      actions.setWorkspaces((w) => [...w, workspace]);
      setWorkspaceId(workspace.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const remixInfo = remix ? REMIX_INFO[remix] : null;
  const showLyrics = mode === 'custom' && model === 'song' && remix !== 'sample';
  const showStyles = !(remix === 'inspiration' || remix === 'voice');
  const sourceDur = Number(source?.duration) || 0;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        {/* ------------ Create form ------------ */}
        <section className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-ink-700 bg-ink-850 p-1">
              {['simple', 'custom'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  disabled={!!remix && m === 'simple'}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${mode === m ? 'bg-white text-ink-950' : 'text-ink-300 hover:text-white'} disabled:opacity-40`}
                >
                  {m}
                </button>
              ))}
            </div>
            <label className="relative">
              <select
                aria-label="Model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={!!remix || mode === 'simple'}
                className="field appearance-none rounded-full py-1.5 pl-3 pr-8 text-xs font-semibold"
              >
                <option value="song">MiniMax 2.6 · full songs</option>
                <option value="instrumental">Quick Beat · 30s</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            </label>
          </div>

          {remixInfo && source && (
            <div className="rounded-2xl border border-gold/40 bg-gold/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-gold">{remixInfo.title}</span>
                <button type="button" className="icon-btn h-7 w-7" aria-label="Cancel remix" onClick={() => router.replace('/create')}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <TrackArt track={source} size={48} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{source.title}</div>
                  <div className="truncate text-xs text-ink-400">{(source.tags || []).join(', ') || formatTime(source.duration)}</div>
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-300">{remixInfo.blurb}</p>
              {source.allow_remixes === false && <p className="mt-1 text-xs text-neon-amber">Remixes are turned off for this song in Manage, but you can still remix your own music.</p>}
            </div>
          )}

          {remix === 'mashup' && source && (
            <Section title="Second song">
              <select
                className="field"
                value={second?.id || ''}
                onChange={(e) => {
                  const s = songs.find((x) => x.id === e.target.value) || null;
                  setSecond(s);
                  if (s) {
                    setStyles((s.tags || []).join(', ') || s.prompt || '');
                    setLyrics((s.lyrics || '').slice(0, LIMIT.cover));
                  }
                }}
              >
                <option value="">Pick a song to blend in</option>
                {songs.filter((s) => s.id !== source.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-ink-500">Its styles and lyrics load below so you can tweak the blend.</p>
            </Section>
          )}

          {remix === 'sample' && source && (
            <Section title="Part to sample" right={<span className="font-mono text-xs text-gold">{formatTime(sampleRange[0])} – {formatTime(sampleRange[1])}</span>}>
              <label className="block text-xs text-ink-300">
                Start
                <input type="range" min={0} max={Math.max(1, sourceDur - 5)} value={sampleRange[0]} className="w-full" onChange={(e) => {
                  const s = Number(e.target.value);
                  setSampleRange([s, Math.min(sourceDur || s + 30, Math.max(s + 5, Math.min(sampleRange[1], s + 30)))]);
                }} />
              </label>
              <label className="mt-2 block text-xs text-ink-300">
                End
                <input type="range" min={sampleRange[0] + 5} max={Math.min(sourceDur || sampleRange[0] + 30, sampleRange[0] + 30)} value={sampleRange[1]} className="w-full" onChange={(e) => setSampleRange([sampleRange[0], Number(e.target.value)])} />
              </label>
              <p className="mt-1 text-xs text-ink-500">5 to 30 seconds. The new beat is 30 seconds long.</p>
            </Section>
          )}

          {remix === 'voice' && (
            <Section title="Your voice sample">
              <VoicePicker value={voice} onChange={setVoice} />
            </Section>
          )}

          {mode === 'simple' && !remix ? (
            <Section title="Song description" right={<button type="button" className="icon-btn h-7 w-7" aria-label="Surprise me" onClick={surprise}><Dices className="h-4 w-4" /></button>}>
              <textarea
                rows={5}
                className="field resize-y leading-relaxed"
                placeholder="A smooth late night R&B song about falling in love again, with sax and a silky male vocal"
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="mt-3 flex items-center justify-between">
                <Toggle on={instrumental} onChange={setInstrumental} label="Instrumental" />
                <span className="text-[11px] text-ink-500">{instrumental ? 'No vocals' : 'AI writes the lyrics'}</span>
              </div>
            </Section>
          ) : (
            <>
              {showLyrics && (
                <Section
                  title="Lyrics"
                  right={
                    remix !== 'inspiration' && remix !== 'voice' ? <Toggle on={instrumental} onChange={setInstrumental} label="Instrumental" /> : null
                  }
                >
                  {instrumental ? (
                    <p className="text-sm text-ink-400">Instrumental: no vocals. Turn it off to add lyrics.</p>
                  ) : (
                    <>
                      <div className="mb-2 flex gap-2">
                        <input
                          className="field py-2 text-sm"
                          placeholder="What's the song about?"
                          value={lyricIdea}
                          onChange={(e) => setLyricIdea(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), writeLyrics())}
                        />
                        <button type="button" className="btn-ghost shrink-0" onClick={writeLyrics} disabled={writing}>
                          {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4 text-gold" />} Write Lyrics
                        </button>
                      </div>
                      <textarea
                        ref={lyricsRef}
                        rows={10}
                        className="field resize-y font-mono text-[13px] leading-6"
                        placeholder={'[Verse]\nWrite your own lyrics, or use Write Lyrics above\n\n[Chorus]\n...'}
                        value={lyrics}
                        maxLength={lyricLimit}
                        onChange={(e) => setLyrics(e.target.value)}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {SECTIONS.map((s) => (
                          <button key={s} type="button" onClick={() => insertSection(s)} className="chip border-ink-700 bg-ink-900 font-mono text-[10px] text-ink-300 hover:text-white">
                            {s}
                          </button>
                        ))}
                        <span className={`ml-auto font-mono text-[11px] ${lyrics.length >= lyricLimit ? 'text-neon-amber' : 'text-ink-500'}`}>
                          {lyrics.length}/{lyricLimit}
                        </span>
                      </div>
                    </>
                  )}
                </Section>
              )}

              {showStyles && (
                <Section title={remix === 'cover' ? 'New style' : 'Styles'} right={<button type="button" className="icon-btn h-7 w-7" aria-label="Surprise me" onClick={surprise}><Dices className="h-4 w-4" /></button>}>
                  <textarea
                    rows={3}
                    className="field resize-y leading-relaxed"
                    placeholder="smooth jazz, sexy saxophone, late night, slow tempo, male vocals"
                    value={styles}
                    maxLength={LIMIT.styles}
                    onChange={(e) => setStyles(e.target.value)}
                  />
                  <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                    {STYLE_SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => addStyle(s)} className="chip border-ink-700 bg-ink-900 text-ink-300 hover:border-gold/50 hover:text-gold">
                        <Plus className="h-3 w-3" /> {s}
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {model === 'instrumental' && !remix && (
                <Section title="Length" right={<span className="font-mono text-sm text-gold">{beatSeconds}s</span>}>
                  <input type="range" min={5} max={30} value={beatSeconds} onChange={(e) => setBeatSeconds(Number(e.target.value))} className="w-full" />
                </Section>
              )}

              {showStyles && (
                <div className="rounded-2xl border border-ink-700 bg-ink-850/70">
                  <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-white" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
                    More Options <ChevronDown className={`h-4 w-4 transition ${moreOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {moreOpen && (
                    <div className="flex flex-col gap-4 border-t border-ink-800 px-4 py-4">
                      <label className="block">
                        <span className="mb-1 block text-xs text-ink-300">Exclude styles</span>
                        <input className="field py-2" placeholder="e.g. autotune, heavy drums" value={exclude} onChange={(e) => setExclude(e.target.value)} />
                      </label>
                      {!instrumental && (
                        <div>
                          <span className="mb-1 block text-xs text-ink-300">Vocal gender</span>
                          <div className="inline-flex rounded-full border border-ink-700 bg-ink-900 p-1">
                            {[['', 'Any'], ['male', 'Male'], ['female', 'Female']].map(([v, l]) => (
                              <button key={l} type="button" onClick={() => setVocal(v)} className={`rounded-full px-3 py-1 text-xs font-semibold ${vocal === v ? 'bg-white text-ink-950' : 'text-ink-300'}`}>
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <Slider label="Weirdness" value={weirdness} onChange={setWeirdness} hint="Low keeps it classic. High gets experimental." />
                      <Slider label="Style Influence" value={influence} onChange={setInfluence} hint="High sticks closely to your styles." />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {(remix === 'inspiration' || remix === 'voice') && (
            <Section title="Lyrics" right={<span className="font-mono text-[11px] text-ink-500">{lyrics.length}/{LIMIT.ref}</span>}>
              <textarea rows={6} className="field resize-y font-mono text-[13px] leading-6" maxLength={LIMIT.ref} placeholder="A few short lines to sing (up to 350 characters)" value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
            </Section>
          )}

          <Section title="Details">
            <input className="field mb-3 py-2" placeholder="Song title (optional)" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <select aria-label="Workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="field appearance-none py-2 pr-8">
                  <option value="">My Workspace</option>
                  {actions.workspaces.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              </label>
              <button type="button" className="btn-ghost py-2" onClick={createWorkspace} aria-label="New workspace">
                <FolderPlus className="h-4 w-4" />
              </button>
              {!remix && (
                <div className="inline-flex rounded-full border border-ink-700 bg-ink-900 p-1" title="How many versions to make">
                  {[1, 2].map((n) => (
                    <button key={n} type="button" onClick={() => setVersions(n)} className={`rounded-full px-3 py-1 text-xs font-semibold ${versions === n ? 'bg-white text-ink-950' : 'text-ink-300'}`}>
                      {n === 1 ? '1 version' : '2 versions'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-neon-pink/40 bg-neon-pink/10 px-3.5 py-3 text-sm text-neon-pink">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pb-2">
            <button type="button" className="btn flex-1 rounded-full bg-gradient-to-r from-gold to-neon-amber py-3 text-[15px] font-bold text-ink-950 hover:brightness-110" onClick={create} disabled={submitting || (remix && !source)}>
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Music4 className="h-5 w-5" />}
              {remix && remix !== 'reuse' ? `Create ${REMIX_INFO[remix].title}` : 'Create'}
            </button>
            <button type="button" className="btn-ghost rounded-full py-3" onClick={clearAll} aria-label="Clear">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* ------------ Workspace songs ------------ */}
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-auto font-display text-xl font-extrabold text-white">
              {actions.workspaces.find((w) => w.id === workspaceId)?.name || 'My Workspace'}
            </h1>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input type="search" className="field rounded-full py-2 pl-9" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {jobs.length > 0 && (
            <ul className="flex flex-col gap-2">
              {jobs.map((j) => (
                <JobCard key={j.id} job={j} onDismiss={() => setJobs((js) => { const n = js.filter((x) => x.id !== j.id); writeJobs(n); return n; })} />
              ))}
            </ul>
          )}

          {loadingSongs && !songs.length ? (
            <p className="flex items-center gap-2 py-10 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading songs</p>
          ) : visible.length ? (
            <ul className="flex flex-col gap-1">
              {visible.map((t) => (
                <SongRow key={t.id} track={t} list={visible} actions={actions} />
              ))}
            </ul>
          ) : (
            <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
              <Sparkles className="h-7 w-7 text-gold" />
              <p className="max-w-sm text-sm text-ink-400">Songs you create show up here. Describe a song or write lyrics, then press Create.</p>
            </div>
          )}
        </section>
      </div>
      {modals}
    </div>
  );
}
