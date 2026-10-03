'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';
import SyncedLyrics from '@/components/SyncedLyrics';
import LyricSync from '@/components/LyricSync';
import { api } from '@/lib/api';
import { lyricLines } from '@/lib/lyrics';

const started = new Set(); // songs already sent for auto-sync this session

// Lyrics for the song that's playing. If they aren't synced yet, the AI syncs them
// automatically the first time, then they follow the music from then on.
export default function LyricsPanel({ track }) {
  const { syncTrack } = usePlayer();
  const [status, setStatus] = useState(null); // null | 'syncing' | error message
  const [tapSync, setTapSync] = useState(false);
  const hasLines = lyricLines(track.lyrics).length > 0;
  const synced = track.lyrics_synced?.length > 0;

  useEffect(() => {
    if (!hasLines || synced || started.has(track.id)) return;
    started.add(track.id);
    let alive = true;
    setStatus('syncing');
    (async () => {
      try {
        const { id } = await api.startLyricSync(track.id);
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const res = await api.pollLyricSync(track.id, id);
          if (res.status === 'succeeded') {
            syncTrack(res.track);
            if (alive) setStatus(null);
            return;
          }
          if (res.status === 'failed' || res.status === 'canceled') throw new Error(res.error || 'Auto-sync failed.');
        }
        throw new Error('Auto-sync took too long.');
      } catch (e) {
        started.delete(track.id);
        if (alive) setStatus(e.message || 'Auto-sync failed.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [track.id, hasLines, synced]); // eslint-disable-line react-hooks/exhaustive-deps

  if (synced) return <SyncedLyrics track={track} className="h-[45vh]" />;

  if (!track.lyrics) {
    return (
      <p className="text-sm text-ink-400">
        No lyrics saved for this song. In My Library, open the song's ••• menu and choose Add lyrics.
      </p>
    );
  }

  return (
    <>
      {status === 'syncing' ? (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold">
          <Loader2 className="h-4 w-4 animate-spin" /> Syncing the lyrics to the music. They'll start moving on their own in about a minute.
        </p>
      ) : status ? (
        <div className="mb-3 rounded-lg border border-neon-pink/40 bg-neon-pink/10 px-3 py-2 text-sm text-neon-pink">
          {status}{' '}
          <button type="button" className="font-semibold underline" onClick={() => setTapSync(true)}>
            Sync by tapping instead
          </button>
        </div>
      ) : null}
      <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-ink-100">{track.lyrics}</pre>
      {tapSync && <LyricSync track={track} onClose={() => setTapSync(false)} onSaved={syncTrack} />}
    </>
  );
}
