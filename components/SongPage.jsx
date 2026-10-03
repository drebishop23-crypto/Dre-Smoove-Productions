'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Lock, MessageSquare, Pause, Play, Send, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { usePlayer } from '@/components/PlayerProvider';
import TrackArt from '@/components/TrackArt';
import SyncedLyrics from '@/components/SyncedLyrics';
import { formatTime } from '@/lib/audio';

// Shareable page for one song: play it, read the lyrics, leave a comment.
export default function SongPage({ id }) {
  const { isCurrent, playing, playTrack, toggle } = usePlayer();
  const [track, setTrack] = useState(null);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.getTrack(id).then(({ track }) => setTrack(track)).catch((e) => setError(e.message));
    api.listComments(id).then(({ comments }) => setComments(comments)).catch(() => {});
  }, [id]);

  if (error) return <p className="mx-auto max-w-3xl py-20 text-center text-ink-400">{error}</p>;
  if (!track) return <p className="flex justify-center py-20 text-ink-400"><Loader2 className="h-5 w-5 animate-spin" /></p>;

  if (!track.is_public) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
        <Lock className="h-8 w-8 text-ink-400" />
        <h1 className="font-display text-xl font-bold text-white">This song is private</h1>
        <p className="text-sm text-ink-400">The artist hasn't published it yet. If it's yours, publish it from the ••• menu in your Library so this link works for others.</p>
        <Link href="/library" className="btn-ghost">Open Library</Link>
      </div>
    );
  }

  const active = isCurrent(track.id);
  const post = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const { comment } = await api.addComment(track.id, { name, body: text });
      setComments((c) => [...c, comment]);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <TrackArt track={track} size={220} rounded="rounded-2xl" className="shadow-2xl" />
        <div className="min-w-0 flex-1">
          <div className="label mb-1">Song</div>
          <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{track.title}</h1>
          <p className="mt-1 text-gold">{track.artist || 'Dré Smoove'}</p>
          <p className="mt-1 text-sm text-ink-400">{(track.tags || []).join(', ')} · {formatTime(track.duration)}</p>
          <button type="button" className="btn-primary mt-4 rounded-full px-6" onClick={() => (active ? toggle() : playTrack(track))}>
            {active && playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
            {active && playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </section>

      {track.lyrics && (
        <section className="panel p-5">
          <div className="label mb-3">Lyrics</div>
          {track.lyrics_synced?.length ? (
            <SyncedLyrics track={track} className="h-[50vh]" />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-ink-100">{track.lyrics}</pre>
          )}
        </section>
      )}

      <section id="comments" className="panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gold" />
          <span className="font-semibold text-white">Comments</span>
          <span className="font-mono text-xs text-ink-500">{comments.length}</span>
        </div>
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="group rounded-xl bg-ink-850 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{c.name}</span>
                <span className="flex items-center gap-2 text-[11px] text-ink-500">
                  {new Date(c.created_at).toLocaleDateString()}
                  <button
                    type="button"
                    className="opacity-0 transition hover:text-neon-pink group-hover:opacity-100"
                    aria-label="Delete comment"
                    onClick={async () => {
                      if (!window.confirm('Delete this comment?')) return;
                      await api.deleteComment(c.id);
                      setComments((cs) => cs.filter((x) => x.id !== c.id));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-200">{c.body}</p>
            </li>
          ))}
          {!comments.length && <li className="text-sm text-ink-500">No comments yet.</li>}
        </ul>
        {track.allow_comments !== false ? (
          <form onSubmit={post} className="mt-4 flex flex-col gap-2">
            <input className="field" placeholder="Your name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <textarea className="field" rows={3} placeholder="Say something about this song" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="btn-primary w-fit" disabled={sending || !text.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post comment
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-ink-500">Comments are turned off for this song.</p>
        )}
      </section>
    </div>
  );
}
