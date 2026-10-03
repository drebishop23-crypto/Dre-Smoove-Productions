'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Hand, Loader2, Minus, Pause, Play, Plus, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import Modal from '@/components/Modal';
import { usePlayer } from '@/components/PlayerProvider';
import { api } from '@/lib/api';
import { lyricLines } from '@/lib/lyrics';
import { formatTime } from '@/lib/audio';

// Sync a song's lyrics to the music, automatically with AI or by tapping along.
export default function LyricSync({ track, onClose, onSaved }) {
  const { playTrack, toggle, playing, time, seek, duration, isCurrent } = usePlayer();
  const lines = useMemo(() => lyricLines(track.lyrics), [track.lyrics]);
  const [synced, setSynced] = useState(() =>
    track.lyrics_synced?.length === lines.length ? track.lyrics_synced : null
  );
  const [mode, setMode] = useState('menu'); // menu | ai | tap | review
  const [aiStatus, setAiStatus] = useState(null);
  const [taps, setTaps] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const tapRef = useRef(null);
  const active = isCurrent(track.id);

  const save = async (data) => {
    setSaving(true);
    setError(null);
    try {
      const { track: saved } = await api.updateTrack(track.id, { lyrics_synced: data });
      setSynced(saved.lyrics_synced);
      onSaved?.(saved);
      setMode('review');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- AI ----------
  const runAI = async () => {
    setMode('ai');
    setError(null);
    setAiStatus('Sending the song to the AI');
    try {
      const { id } = await api.startLyricSync(track.id);
      setAiStatus('Listening to the song');
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await api.pollLyricSync(track.id, id);
        if (res.status === 'succeeded') {
          setSynced(res.track.lyrics_synced);
          onSaved?.(res.track);
          setMode('review');
          return;
        }
        if (res.status === 'failed' || res.status === 'canceled') throw new Error(res.error || 'The AI could not sync this song.');
        setAiStatus(res.status === 'processing' ? 'Matching the words to the music' : 'Warming up the AI');
      }
      throw new Error('That took too long. Try again.');
    } catch (e) {
      setError(e.message);
      setMode('menu');
    }
  };

  // ---------- Tap ----------
  const startTap = () => {
    setTaps([]);
    setMode('tap');
    if (active) {
      seek(0);
      if (!playing) toggle();
    } else {
      playTrack(track);
    }
  };

  const tap = () => {
    if (!active) return;
    setTaps((t) => (t.length < lines.length ? [...t, Math.round(time * 100) / 100] : t));
  };

  useEffect(() => {
    if (mode !== 'tap') return;
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (mode === 'tap' && taps.length === lines.length) {
      save(lines.map((text, i) => ({ t: taps[i], text })));
    }
  }, [taps]); // eslint-disable-line react-hooks/exhaustive-deps

  const shiftAll = (sec) => {
    if (!synced) return;
    setSynced(synced.map((l) => ({ ...l, t: Math.max(0, Math.round((l.t + sec) * 100) / 100) })));
  };

  return (
    <Modal
      title="Sync lyrics to the music"
      onClose={onClose}
      wide
      footer={
        mode === 'review' ? (
          <>
            <button type="button" className="btn-ghost" onClick={() => setMode('menu')}>
              <RotateCcw className="h-4 w-4" /> Redo
            </button>
            <button type="button" className="btn-primary" onClick={() => save(synced).then(onClose)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Done
            </button>
          </>
        ) : (
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
        )
      }
    >
      {!lines.length ? (
        <p className="text-sm text-ink-300">This song has no lyrics yet. Add them in Edit details first.</p>
      ) : mode === 'menu' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={runAI} className="flex flex-col gap-2 rounded-xl border border-ink-700 bg-ink-850 p-4 text-left transition hover:border-gold/60">
            <Sparkles className="h-5 w-5 text-gold" />
            <span className="font-display font-bold text-white">Auto-sync with AI</span>
            <span className="text-sm text-ink-400">The AI listens to the song and lines up every lyric line. Takes about a minute and costs a few cents.</span>
          </button>
          <button type="button" onClick={startTap} className="flex flex-col gap-2 rounded-xl border border-ink-700 bg-ink-850 p-4 text-left transition hover:border-gold/60">
            <Hand className="h-5 w-5 text-neon-cyan" />
            <span className="font-display font-bold text-white">Tap to sync</span>
            <span className="text-sm text-ink-400">The song plays and you tap the button (or the space bar) as each line starts. Free and exact.</span>
          </button>
          {synced && (
            <button type="button" onClick={() => setMode('review')} className="text-left text-sm font-semibold text-gold hover:underline sm:col-span-2">
              This song is already synced. Review or adjust it.
            </button>
          )}
          {error && <p className="text-sm text-neon-pink sm:col-span-2">{error}</p>}
        </div>
      ) : mode === 'ai' ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
          <p className="font-semibold text-white">{aiStatus}</p>
          <p className="text-sm text-ink-400">You can leave this open. It saves on its own when it's done.</p>
        </div>
      ) : mode === 'tap' ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm text-ink-400">
            <span>Line {Math.min(taps.length + 1, lines.length)} of {lines.length}</span>
            <span className="font-mono tabular-nums">{formatTime(active ? time : 0)} / {formatTime(active ? duration : track.duration)}</span>
          </div>
          <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
            <div className="label mb-1">Tap when this line starts</div>
            <div className="font-display text-xl font-bold text-gold">{lines[taps.length] || 'All lines done'}</div>
            {lines[taps.length + 1] && <div className="mt-2 text-sm text-ink-400">Next: {lines[taps.length + 1]}</div>}
          </div>
          <button
            ref={tapRef}
            type="button"
            onClick={tap}
            disabled={!active || taps.length >= lines.length || saving}
            className="btn-primary py-6 font-display text-lg"
          >
            <Hand className="h-5 w-5" /> Tap
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={toggle} disabled={!active}>
              {playing && active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing && active ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setTaps((t) => t.slice(0, -1))} disabled={!taps.length}>
              <Undo2 className="h-4 w-4" /> Undo last tap
            </button>
            <button type="button" className="btn-ghost" onClick={startTap}>
              <RotateCcw className="h-4 w-4" /> Start over
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-300">Lyrics a little early or late? Shift every line:</span>
            <button type="button" className="btn-ghost px-2.5 py-1.5" onClick={() => shiftAll(-0.25)}>
              <Minus className="h-3.5 w-3.5" /> 0.25s earlier
            </button>
            <button type="button" className="btn-ghost px-2.5 py-1.5" onClick={() => shiftAll(0.25)}>
              <Plus className="h-3.5 w-3.5" /> 0.25s later
            </button>
          </div>
          <ol className="max-h-[45vh] overflow-y-auto rounded-xl border border-ink-700 bg-ink-850 p-2">
            {(synced || []).map((l, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-ink-700"
                  onClick={() => {
                    if (!active) playTrack(track);
                    if (duration) seek(l.t / duration);
                  }}
                >
                  <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-ink-500">{formatTime(l.t)}</span>
                  <span className="text-sm text-ink-100">{l.text}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-500">Click any line to hear it from that spot. Click Done to save.</p>
          {error && <p className="text-sm text-neon-pink">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
