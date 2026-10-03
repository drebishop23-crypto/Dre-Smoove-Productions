'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { usePlayer } from '@/components/PlayerProvider';
import SyncedLyrics from '@/components/SyncedLyrics';
import LyricSync from '@/components/LyricSync';
import { api } from '@/lib/api';
import { lyricLines } from '@/lib/lyrics';
import { syncInBrowser } from '@/lib/browserSync';

const started = new Set(); // songs already being synced this session

// Lyrics for the song that's playing. If they aren't synced yet, they get synced
// automatically right in the browser (free, no token), then follow the music from then on.
export default function LyricsPanel({ track }) {
  const { syncTrack } = usePlayer();
  const [status, setStatus] = useState(null); // null | { busy: true, text } | { error }
  const [tapSync, setTapSync] = useState(false);
  const hasLines = lyricLines(track.lyrics).length > 0;
  const synced = track.lyrics_synced?.length > 0;

  useEffect(() => {
    if (!hasLines || synced || started.has(track.id)) return;
    started.add(track.id);
    let alive = true;
    const say = (text) => alive && setStatus({ busy: true, text });
    say('Syncing the lyrics to the music');
    (async () => {
      try {
        const data = await syncInBrowser(track, say);
        const { track: saved } = await api.updateTrack(track.id, { lyrics_synced: data });
        syncTrack(saved);
        if (alive) setStatus(null);
      } catch (e) {
        started.delete(track.id);
        if (alive) setStatus({ error: e.message || 'Auto-sync failed.' });
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
      {status?.busy ? (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> {status.text}. Keep this open; the lines start moving on their own when it's done.
        </p>
      ) : status?.error ? (
        <div className="mb-3 rounded-lg border border-neon-pink/40 bg-neon-pink/10 px-3 py-2 text-sm text-neon-pink">
          {status.error}{' '}
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
