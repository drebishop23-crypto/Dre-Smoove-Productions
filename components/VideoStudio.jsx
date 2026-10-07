'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Clapperboard,
  Download,
  Film,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { api } from '@/lib/api';
import TrackArt from '@/components/TrackArt';
import ReleaseModal from '@/components/ReleaseModal';
import { downloadBlob, formatTime, safeFilename } from '@/lib/audio';

const CLIP_SECONDS = 81 / 16; // one Wan 2.2 clip
const CLIP_PRICE = 0.05; // USD per clip at 480p

const DEFAULT_LOOK =
  'Moody cinematic R&B music video, warm gold and deep blue lighting, shallow depth of field, 35mm film look';

const IDEAS = [
  'A man in a tailored suit walks slowly down a rain-soaked Brooklyn street at night, neon reflections',
  'Close-up of hands on a vintage microphone in a dim studio, soft light',
  'A couple slow dancing in an empty ballroom, golden light through tall windows',
  'City skyline at dusk seen from a rooftop, wind moving through the scene',
  'Old vinyl record spinning on a turntable, warm glow, dust in the light',
  'Silhouette of a singer on a stage with a single spotlight and haze',
  'Driving across a bridge at night, city lights streaking past the window',
  'Two people laughing at a corner diner table, nostalgic 90s mood',
];

function buildScenes(track, count) {
  const lines = (track.lyrics || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const scenes = [];
  let section = '';
  const lyricLines = [];
  for (const l of lines) {
    if (/^\[.*\]$/.test(l)) section = l.replace(/[[\]]/g, '');
    else lyricLines.push({ text: l, section });
  }
  for (let i = 0; i < count; i++) {
    if (lyricLines.length) {
      const pick = lyricLines[Math.floor((i * lyricLines.length) / count)];
      scenes.push(`${pick.section ? `${pick.section} mood: ` : ''}a visual scene that shows "${pick.text}"`);
    } else {
      scenes.push(IDEAS[i % IDEAS.length]);
    }
  }
  return scenes;
}

function StatusDot({ status }) {
  const color =
    status === 'done'
      ? 'bg-neon-cyan'
      : status === 'failed'
        ? 'bg-neon-pink'
        : status === 'pending'
          ? 'bg-ink-700'
          : 'animate-pulse bg-gold';
  return <span className={`block h-3 w-3 rounded-sm ${color}`} title={status} />;
}

export default function VideoStudio({ trackId }) {
  const [track, setTrack] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [job, setJob] = useState(null);
  const [progress, setProgress] = useState(null);
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [scenesText, setScenesText] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [build, setBuild] = useState(null); // { stage, pct }
  const [builtUrl, setBuiltUrl] = useState(null);
  const [showRelease, setShowRelease] = useState(false);
  const [newVersion, setNewVersion] = useState(false);
  const builtBlob = useRef(null);
  const [notes, setNotes] = useState('');
  const [directing, setDirecting] = useState(null); // status text while planning
  const [plan, setPlan] = useState(null); // { bpm, peaks, lyricsTimed }

  const loadTrack = useCallback(async () => {
    const { tracks } = await api.listTracks();
    const t = tracks.find((x) => x.id === trackId);
    if (!t) throw new Error('Song not found.');
    setTrack(t);
    return t;
  }, [trackId]);

  useEffect(() => {
    (async () => {
      try {
        const t = await loadTrack();
        const { job } = await api.latestVideoJob(trackId);
        setJob(job);
        const dur = Number(t.duration) || 180;
        setScenesText(buildScenes(t, Math.ceil(dur / CLIP_SECONDS)).join('\n'));
      } catch (e) {
        setLoadError(e.message);
      }
    })();
  }, [trackId, loadTrack]);

  // Keep the job moving while this page is open
  useEffect(() => {
    if (!job || job.status === 'done') return;
    let alive = true;
    let timer;
    const tick = async () => {
      try {
        const res = await api.pollVideo(job.id);
        if (!alive) return;
        setProgress(res);
        if (!res.ready) timer = setTimeout(tick, 4000);
      } catch (e) {
        if (alive) timer = setTimeout(tick, 8000);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [job]);

  const scenes = useMemo(() => scenesText.split('\n').map((s) => s.trim()).filter(Boolean), [scenesText]);
  const duration = Number(track?.duration) || 0;
  const needed = duration ? Math.ceil(duration / CLIP_SECONDS) : scenes.length;
  const cost = scenes.length * CLIP_PRICE;

  // AI Director: listen to the song, then plan one shot per ~5 seconds that follows it
  const direct = async () => {
    setError(null);
    try {
      const { analyzeSong } = await import('@/lib/songAnalysis');
      const a = await analyzeSong(track, CLIP_SECONDS, setDirecting);
      setDirecting(`Planning ${a.segments.length} shots to match the song`);
      const res = await api.directVideo({
        title: track.title,
        tags: track.tags || [],
        bpm: a.bpm,
        duration: a.duration,
        segments: a.segments,
        notes: notes.trim(),
      });
      const fallback = buildScenes(track, a.segments.length);
      const shots = a.segments.map((_, i) => res.scenes[i] || fallback[i]);
      if (res.look) setLook(res.look);
      setScenesText(shots.join('\n'));
      setPlan({ bpm: a.bpm, peaks: a.segments.filter((x) => x.level === 'peak').length, lyricsTimed: a.lyricsTimed, count: shots.length });
    } catch (e) {
      setError(e.message || 'The director could not plan this song.');
    } finally {
      setDirecting(null);
    }
  };

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { job } = await api.startVideo({ track_id: trackId, look, scenes });
      setProgress(null);
      setBuiltUrl(null);
      setNewVersion(false);
      setJob(job);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };

  const retry = async () => {
    try {
      const res = await api.retryVideo(job.id);
      setProgress(res);
      setJob({ ...job });
    } catch (e) {
      setError(e.message);
    }
  };

  // Your own video file (MP4/MOV) as the song's video
  const [uploadPct, setUploadPct] = useState(null);
  const uploadOwn = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) return setError('That file is not a video. Use an MP4 or MOV.');
    setError(null);
    setUploadPct(0);
    try {
      const { track: saved } = await api.saveVideo(trackId, file, setUploadPct);
      setTrack(saved);
      setNewVersion(false);
      setBuiltUrl(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadPct(null);
    }
  };

  // Free video: the cover art (on a blurred copy of itself) with the song
  const makeCoverVideo = async () => {
    setError(null);
    setBuild({ stage: 'Drawing the cover', pct: 0 });
    try {
      const W = 1280, H = 720;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = '#07090e';
      g.fillRect(0, 0, W, H);
      if (track.artwork_url) {
        const img = await new Promise((res, rej) => {
          const i = new Image();
          i.crossOrigin = 'anonymous';
          i.onload = () => res(i);
          i.onerror = () => rej(new Error('Could not load the cover art.'));
          i.src = track.artwork_url;
        });
        const bg = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.1;
        g.filter = 'blur(30px) brightness(0.45)';
        g.drawImage(img, (W - img.naturalWidth * bg) / 2, (H - img.naturalHeight * bg) / 2, img.naturalWidth * bg, img.naturalHeight * bg);
        g.filter = 'none';
        const side = 600;
        g.shadowColor = 'rgba(0,0,0,.6)';
        g.shadowBlur = 40;
        g.drawImage(img, (W - side) / 2, (H - side) / 2, side, side);
        g.shadowBlur = 0;
      } else {
        g.fillStyle = '#e8b94a';
        g.font = 'bold 64px sans-serif';
        g.textAlign = 'center';
        g.fillText(track.title, W / 2, H / 2);
        g.font = '32px sans-serif';
        g.fillStyle = '#c6cedc';
        g.fillText(track.artist || 'Dré Smoove', W / 2, H / 2 + 56);
      }
      const frame = await new Promise((r) => c.toBlob(r, 'image/png'));
      const { coverVideo } = await import('@/lib/stitch');
      const blob = await coverVideo({ frame, audioUrl: track.url, audioExt: track.format || 'wav', onProgress: setBuild });
      builtBlob.current = blob;
      setBuiltUrl(URL.createObjectURL(blob));
      setBuild({ stage: 'Saving to your vault', pct: 100 });
      const { track: saved } = await api.saveVideo(trackId, blob);
      setTrack(saved);
      setNewVersion(false);
      setBuild(null);
    } catch (e) {
      setBuild(null);
      setError(e.message || 'The cover video could not be made.');
    }
  };

  const buildVideo = async () => {
    setError(null);
    setBuild({ stage: 'Starting', pct: 0 });
    try {
      const { stitchVideo } = await import('@/lib/stitch');
      const blob = await stitchVideo({
        clipUrls: progress.clip_urls,
        audioUrl: track.url,
        audioExt: track.format || 'wav',
        duration,
        clipSeconds: CLIP_SECONDS,
        onProgress: setBuild,
      });
      builtBlob.current = blob;
      setBuiltUrl(URL.createObjectURL(blob));
      setBuild({ stage: 'Saving to your vault', pct: 100 });
      const { track: saved } = await api.saveVideo(trackId, blob);
      setTrack(saved);
      setBuild(null);
    } catch (e) {
      setBuild(null);
      setError(e.message || 'The video could not be built.');
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-neon-pink">{loadError}</p>
        <Link href="/library" className="btn-ghost mt-4">Back to Library</Link>
      </div>
    );
  }
  if (!track) {
    return (
      <div className="flex items-center gap-2 text-ink-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading
      </div>
    );
  }

  const hasVideo = Boolean(track.video_url) && !newVersion;
  const inProgress = job && progress && !progress.ready && job.status !== 'done';
  const clipsReady = progress?.ready;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link href="/library" className="inline-flex w-fit items-center gap-2 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Library
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <TrackArt track={track} size={72} rounded="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="label mb-1">Music video</div>
          <h1 className="truncate font-display text-2xl font-extrabold text-gold">{track.title}</h1>
          <p className="font-mono text-xs text-ink-400">
            {duration ? formatTime(duration) : 'Length unknown'} · {needed} clips of ~5 seconds
          </p>
        </div>
      </header>

      {/* Finished video */}
      {(hasVideo || builtUrl) && (
        <section className="panel overflow-hidden">
          <video src={builtUrl || track.video_url} controls playsInline className="aspect-video w-full bg-black" />
          <div className="flex flex-wrap items-center gap-2 p-4">
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                const blob = builtBlob.current || (await (await fetch(track.video_url)).blob());
                downloadBlob(blob, `${safeFilename(track.title)} - music video.mp4`);
              }}
            >
              <Download className="h-4 w-4" /> Download MP4
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowRelease(true)}>
              <Send className="h-4 w-4 text-gold" /> Release &amp; share
            </button>
            {!inProgress && (
              <button type="button" className="btn text-ink-400 hover:text-white" onClick={() => { setNewVersion(true); setBuiltUrl(null); setJob(null); setProgress(null); }}>
                <RotateCcw className="h-4 w-4" /> Make a new version
              </button>
            )}
            {hasVideo && (
              <button
                type="button"
                className="btn ml-auto text-red-300 hover:text-red-200"
                onClick={async () => {
                  if (!window.confirm(`Delete the music video for “${track.title}”? The song stays. This can't be undone.`)) return;
                  try {
                    await api.deleteVideo(track.id);
                    setTrack((t) => ({ ...t, video_path: null, video_url: null }));
                    setBuiltUrl(null);
                    builtBlob.current = null;
                    setJob(null);
                    setProgress(null);
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete video
              </button>
            )}
          </div>
        </section>
      )}

      {/* Rendering progress */}
      {job && progress && !hasVideo && !builtUrl && (
        <section className="panel p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-white">{clipsReady ? 'All clips are ready' : 'Rendering clips'}</h2>
              <p className="text-sm text-ink-400">
                {progress.counts.done} of {progress.total} done
                {progress.counts.running ? ` · ${progress.counts.running} rendering` : ''}
                {progress.counts.failed ? ` · ${progress.counts.failed} failed` : ''}
              </p>
            </div>
            {progress.counts.failed > 0 && (
              <button type="button" className="btn-ghost" onClick={retry}>
                <RotateCcw className="h-4 w-4" /> Retry failed clips
              </button>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-700">
            <div className="h-full bg-gradient-to-r from-neon-cyan to-gold transition-all" style={{ width: `${(progress.counts.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {progress.clips.map((c) => (
              <StatusDot key={c.idx} status={c.status} />
            ))}
          </div>
          {!clipsReady && (
            <p className="mt-4 text-xs text-ink-500">
              Keep this page open while the clips render. Each clip takes about 30 to 60 seconds, and several render at once.
            </p>
          )}
          {clipsReady && (
            <div className="mt-5 border-t border-ink-800 pt-5">
              {build ? (
                <div>
                  <div className="mb-1 flex justify-between text-sm text-ink-300">
                    <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {build.stage}</span>
                    <span className="font-mono tabular-nums">{Math.round(build.pct)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full bg-gold transition-all" style={{ width: `${build.pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-500">This runs on your computer. Keep the tab open; a 4-minute song takes a minute or two.</p>
                </div>
              ) : (
                <button type="button" className="btn-primary px-5 py-3" onClick={buildVideo}>
                  <Film className="h-4 w-4" /> Build the full video with the song
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {job && !progress && !hasVideo && (
        <div className="flex items-center gap-2 text-sm text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking on your video
        </div>
      )}

      {/* Quick options: your own video, or a free cover-art video */}
      {!job && !hasVideo && !builtUrl && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="panel flex flex-col gap-3 p-5">
            <h2 className="font-display text-lg font-bold text-white">Upload your own video</h2>
            <p className="text-sm text-ink-400">Already have a video for this song? Add the MP4 or MOV here, then send it to YouTube.</p>
            <label className={`btn-ghost mt-auto w-fit cursor-pointer ${uploadPct !== null ? 'pointer-events-none opacity-60' : ''}`}>
              {uploadPct !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadPct !== null ? `Uploading ${Math.round(uploadPct * 100)}%` : 'Choose video file'}
              <input type="file" accept="video/*" className="hidden" onChange={(e) => { uploadOwn(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          <div className="panel flex flex-col gap-3 p-5">
            <h2 className="font-display text-lg font-bold text-white">Cover art video (free)</h2>
            <p className="text-sm text-ink-400">Your album cover on screen while the whole song plays. The usual way artists post music to YouTube. Made on your computer, no cost.</p>
            {build ? (
              <p className="mt-auto flex items-center gap-2 text-sm text-gold"><Loader2 className="h-4 w-4 animate-spin" /> {build.stage} {Math.round(build.pct)}%</p>
            ) : (
              <button type="button" className="btn-primary mt-auto w-fit" onClick={makeCoverVideo}>
                <Film className="h-4 w-4" /> Make cover video
              </button>
            )}
          </div>
        </section>
      )}

      {/* New video form */}
      {!job && !hasVideo && !builtUrl && (
        <section className="panel flex flex-col gap-5 p-5">
          <h2 className="font-display text-lg font-bold text-white">Or make a full AI music video</h2>
          <div className="rounded-xl border border-gold/40 bg-gold/5 p-4">
            <div className="flex items-center gap-2 font-semibold text-gold">
              <Clapperboard className="h-4 w-4" /> AI Director
            </div>
            <p className="mt-1 text-sm text-ink-300">
              The AI listens to the song (its tempo, the quiet and big moments, and the words as they're sung) and plans every shot to follow it, start to finish.
            </p>
            <input
              className="field mt-3"
              placeholder="Your idea for the video (optional), e.g. a tribute to my nephew, family memories, warm and hopeful"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!!directing}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary" onClick={direct} disabled={!!directing}>
                {directing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {directing ? `${directing}…` : 'Listen to the song & plan my video'}
              </button>
              <span className="text-xs text-ink-500">Planning costs under a penny. You review the shots before anything is made.</span>
            </div>
            {plan && (
              <p className="mt-3 text-sm text-ink-200">
                Planned {plan.count} shots{plan.bpm ? ` at about ${plan.bpm} BPM` : ''}, with {plan.peaks} big {plan.peaks === 1 ? "moment" : "moments"}.{' '}
                {plan.lyricsTimed
                  ? 'Each shot acts out the line being sung at that moment.'
                  : 'Tip: open the lyrics while the song plays so they sync, then plan again so each shot lands right on its line.'}{' '}
                Every shot is moving video (people, places, camera motion), not words on screen. Edit any shot below, then generate.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="video-look" className="label mb-2 block">Look &amp; feel for the whole video</label>
            <textarea id="video-look" rows={2} className="field resize-y" value={look} onChange={(e) => setLook(e.target.value)} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="video-scenes" className="label">Scenes, one per line (each line is a ~5 second shot)</label>
              <button
                type="button"
                className="btn px-2 py-1 text-xs text-ink-400 hover:text-white"
                onClick={() => setScenesText(buildScenes(track, needed).join('\n'))}
              >
                <Wand2 className="h-3.5 w-3.5" /> {track.lyrics ? 'Rebuild from lyrics' : 'Reset scenes'}
              </button>
            </div>
            <textarea
              id="video-scenes"
              rows={12}
              className="field resize-y font-mono text-[12px] leading-6"
              value={scenesText}
              onChange={(e) => setScenesText(e.target.value)}
            />
            <p className="mt-2 text-xs text-ink-500">
              {track.lyrics
                ? 'Each line describes what the camera shows. The lyrics only guide the story; no text appears in the video. Edit any line to change that shot.'
                : 'This song has no lyrics saved, so these are general scenes. Add lyrics in the Library to get scenes that follow the song.'}
              {scenes.length < needed && ` With ${scenes.length} scenes the clips repeat to cover the full ${formatTime(duration)}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 pt-5">
            <button type="button" className="btn-primary px-5 py-3 text-[15px]" onClick={start} disabled={starting || !scenes.length}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate {scenes.length} clips · about ${cost.toFixed(2)}
            </button>
            <span className="text-xs text-ink-500">Charged by Replicate at about 5¢ per clip.</span>
          </div>
        </section>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-neon-pink/40 bg-neon-pink/10 px-3.5 py-3 text-sm text-neon-pink">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {showRelease && <ReleaseModal track={track} onClose={() => setShowRelease(false)} onSaved={setTrack} />}
    </div>
  );
}
