'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  Check,
  Clapperboard,
  ExternalLink,
  Eye,
  Headphones,
  Heart,
  ImagePlus,
  Loader2,
  Music2,
  Pause,
  Pencil,
  Play,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePlayer } from '@/components/PlayerProvider';
import TrackArt from '@/components/TrackArt';
import Modal from '@/components/Modal';
import CoverGenerator from '@/components/CoverGenerator';
import { formatTime } from '@/lib/audio';

const PLATFORMS = [
  ['spotify_url', 'Spotify'],
  ['apple_music_url', 'Apple Music'],
  ['soundcloud_url', 'SoundCloud'],
  ['youtube_url', 'YouTube'],
  ['instagram_url', 'Instagram'],
];

const fmtNum = (n) => new Intl.NumberFormat('en-US', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n || 0);

function readLiked() {
  try {
    return new Set(JSON.parse(localStorage.getItem('sp-liked') || '[]'));
  } catch {
    return new Set();
  }
}
function writeLiked(set) {
  try {
    localStorage.setItem('sp-liked', JSON.stringify([...set]));
  } catch {}
}

/* ------------------------------------------------------------------ */
function EditProfile({ profile, onClose, onSaved }) {
  const [form, setForm] = useState({
    display_name: profile.display_name || '',
    handle: profile.handle || '',
    bio: profile.bio || '',
    genres: (profile.genres || []).join(', '),
    ...Object.fromEntries(PLATFORMS.map(([k]) => [k, profile[k] || ''])),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [aiTarget, setAiTarget] = useState(null);
  const [busyImg, setBusyImg] = useState(null);
  const [current, setCurrent] = useState(profile);
  const avatarRef = useRef(null);
  const bannerRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const uploadImg = async (file, field) => {
    setBusyImg(field);
    setError(null);
    try {
      const { profile: p } = await api.uploadProfileImage(file, field);
      setCurrent(p);
      onSaved(p, { keepOpen: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyImg(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { profile: p } = await api.updateProfile({
        ...form,
        genres: form.genres.split(',').map((g) => g.trim()).filter(Boolean),
      });
      onSaved(p);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit profile"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save profile
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['avatar_path', 'Profile picture', current.avatar_url, avatarRef, 'avatar'],
            ['banner_path', 'Banner', current.banner_url, bannerRef, 'banner'],
          ].map(([field, label, url, ref, target]) => (
            <div key={field} className="rounded-xl border border-ink-700 bg-ink-850 p-3">
              <div className="label mb-2">{label}</div>
              <div className={`mb-3 overflow-hidden ${target === 'avatar' ? 'h-20 w-20 rounded-full bg-ink-800' : 'h-20 w-full rounded-lg bg-black'}`}>
                {url && <img src={url} alt="" className={`h-full w-full ${target === 'avatar' ? 'object-cover' : 'object-contain'}`} />}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => ref.current?.click()} disabled={busyImg === field}>
                  {busyImg === field ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Upload
                </button>
                <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setAiTarget(target)}>
                  <Sparkles className="h-3.5 w-3.5 text-gold" /> Generate
                </button>
              </div>
              <input
                ref={ref}
                id={`profile-${field}`}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImg(f, field);
                  e.target.value = '';
                }}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-name" className="label mb-2 block">Artist name</label>
            <input id="pf-name" className="field" value={form.display_name} onChange={set('display_name')} />
          </div>
          <div>
            <label htmlFor="pf-handle" className="label mb-2 block">Handle</label>
            <input id="pf-handle" className="field" value={form.handle} onChange={set('handle')} />
          </div>
        </div>
        <div>
          <label htmlFor="pf-bio" className="label mb-2 block">About</label>
          <textarea id="pf-bio" rows={4} className="field resize-y leading-relaxed" value={form.bio} onChange={set('bio')} />
        </div>
        <div>
          <label htmlFor="pf-genres" className="label mb-2 block">Genres (comma separated)</label>
          <input id="pf-genres" className="field" value={form.genres} onChange={set('genres')} />
        </div>
        <div>
          <div className="label mb-2">Links</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PLATFORMS.map(([k, label]) => (
              <input key={k} id={`pf-${k}`} aria-label={`${label} link`} className="field" placeholder={`${label} link`} value={form[k]} onChange={set(k)} />
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-neon-pink">{error}</p>}
      </div>
      {aiTarget && (
        <CoverGenerator
          target={aiTarget}
          initialPrompt={
            aiTarget === 'avatar'
              ? 'Stylish portrait artwork of a smooth R&B singer silhouette with a vintage microphone, gold and deep navy tones'
              : 'Wide panoramic Brooklyn skyline at night, smooth R&B mood, gold and deep blue neon glow'
          }
          onClose={() => setAiTarget(null)}
          onSaved={async () => {
            const { profile: p } = await api.getProfile();
            setCurrent(p);
            onSaved(p, { keepOpen: true });
          }}
        />
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
function SongRow({ track, index, list, liked, onLike }) {
  const { isCurrent, playing, playTrack, toggle } = usePlayer();
  const active = isCurrent(track.id);
  return (
    <li className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 transition sm:grid-cols-[1.5rem_auto_minmax(0,1fr)_auto_auto_auto] sm:px-3 ${active ? 'bg-ink-800/80 ring-1 ring-ink-700' : 'hover:bg-ink-850'}`}>
      <span className="hidden text-right font-mono text-xs tabular-nums text-ink-500 sm:block">{index + 1}</span>
      <button
        type="button"
        className="relative"
        onClick={() => (active ? toggle() : playTrack(track, list))}
        aria-label={active && playing ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        <TrackArt track={track} size={56} />
        <span className={`absolute inset-0 flex items-center justify-center rounded-lg bg-ink-950/55 text-white transition ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {active && playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
        </span>
      </button>
      <div className="min-w-0">
        <div className={`truncate font-semibold ${active ? 'text-gold' : 'text-white'}`}>{track.title}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
          <span className="truncate">{(track.tags || []).slice(0, 3).join(' · ') || track.artist}</span>
          <span className="inline-flex items-center gap-1 sm:hidden"><Headphones className="h-3 w-3" /> {fmtNum(track.plays)}</span>
          {track.video_path && (
            <Link href={`/video/${track.id}`} className="inline-flex items-center gap-1 text-gold hover:underline">
              <Clapperboard className="h-3 w-3" /> Video
            </Link>
          )}
        </div>
      </div>
      <span className="hidden items-center gap-1 font-mono text-xs tabular-nums text-ink-400 sm:inline-flex">
        <Headphones className="h-3.5 w-3.5" /> {fmtNum(track.plays)}
      </span>
      <button
        type="button"
        onClick={() => onLike(track)}
        aria-pressed={liked}
        aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
        className={`hidden items-center gap-1 rounded-full px-2 py-1 font-mono text-xs tabular-nums transition sm:inline-flex ${liked ? 'text-neon-pink' : 'text-ink-400 hover:text-white'}`}
      >
        <Heart className="h-3.5 w-3.5" fill={liked ? 'currentColor' : 'none'} /> {fmtNum(track.likes)}
      </button>
      <span className="w-10 text-right font-mono text-xs tabular-nums text-ink-400">{formatTime(track.duration)}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
export default function ProfilePage() {
  const { playTrack } = usePlayer();
  const [profile, setProfile] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('popular');
  const [editing, setEditing] = useState(false);
  const [liked, setLiked] = useState(() => new Set());

  const load = useCallback(async (countView) => {
    try {
      const [{ profile }, { tracks }] = await Promise.all([api.getProfile(countView), api.listTracks()]);
      setProfile(profile);
      setTracks(tracks);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    setLiked(readLiked());
    load(true);
  }, [load]);

  const sorted = useMemo(() => {
    const list = [...tracks];
    if (sort === 'popular') list.sort((a, b) => (b.plays || 0) - (a.plays || 0) || String(b.created_at).localeCompare(String(a.created_at)));
    else list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return list;
  }, [tracks, sort]);

  const onLike = async (t) => {
    const isLiked = liked.has(t.id);
    const next = new Set(liked);
    isLiked ? next.delete(t.id) : next.add(t.id);
    setLiked(next);
    writeLiked(next);
    setTracks((ts) => ts.map((x) => (x.id === t.id ? { ...x, likes: Math.max(0, (x.likes || 0) + (isLiked ? -1 : 1)) } : x)));
    api.trackStat(t.id, isLiked ? 'unlike' : 'like').catch(() => {});
  };

  if (error) return <p className="text-neon-pink">{error}</p>;
  if (!profile) {
    return (
      <div className="flex items-center gap-2 text-ink-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading profile
      </div>
    );
  }

  const stats = [
    ['Profile views', profile.stats.views, Eye],
    ['Songs', profile.stats.songs, Music2],
    ['Plays', profile.stats.plays, Headphones],
    ['Likes', profile.stats.likes, Heart],
  ];
  const links = PLATFORMS.filter(([k]) => profile[k]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      {/* Banner + identity */}
      <section className="overflow-hidden rounded-3xl border border-ink-700 bg-ink-900">
        <div className="relative h-44 overflow-hidden bg-black sm:h-64">
          {profile.banner_url ? (
            <>
              {/* Blurred fill behind, full image on top, so any shape (square logo or wide photo) fits whole */}
              <img src={profile.banner_url} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
              <img src={profile.banner_url} alt="" className="relative h-full w-full object-contain" />
            </>
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(120% 140% at 15% 0%, rgba(232,185,74,.35), transparent 55%), radial-gradient(90% 120% at 90% 10%, rgba(157,123,255,.35), transparent 60%), #0b0f16' }}
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-900 to-transparent" />
        </div>
        <div className="relative flex flex-col gap-5 px-5 pb-6 pt-5 sm:-mt-20 sm:px-8 sm:pt-0">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full bg-ink-800 ring-4 ring-gold/80 sm:h-36 sm:w-36">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-display text-3xl font-extrabold text-gold">
                    {profile.display_name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                  </div>
                )}
              </div>
              <div className="pb-1">
                <h1 className="font-display text-3xl font-extrabold tracking-tight text-gold sm:text-4xl">{profile.display_name}</h1>
                <p className="font-mono text-sm text-ink-400">@{profile.handle}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit profile
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!sorted.length}
                onClick={() => sorted[0] && playTrack(sorted[0], sorted)}
              >
                <Play className="h-4 w-4" fill="currentColor" /> Play
              </button>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(([label, value, Icon]) => (
              <div key={label} className="rounded-xl bg-ink-850 px-4 py-3">
                <dt className="flex items-center gap-1.5 text-xs text-ink-400">
                  <Icon className="h-3.5 w-3.5" /> {label}
                </dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums text-white">{fmtNum(value)}</dd>
              </div>
            ))}
          </dl>

          {profile.bio && <p className="max-w-3xl text-[15px] leading-7 text-ink-200">{profile.bio}</p>}

          <div className="flex flex-wrap items-center gap-2">
            {(profile.genres || []).map((g) => (
              <span key={g} className="chip border-gold/40 bg-gold/10 text-gold">{g}</span>
            ))}
            {links.map(([k, label]) => (
              <a key={k} href={profile[k]} target="_blank" rel="noreferrer" className="chip border-ink-600 bg-ink-850 text-ink-200 hover:border-ink-400 hover:text-white">
                {label} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
            {!links.length && (
              <button type="button" onClick={() => setEditing(true)} className="chip border-dashed border-ink-600 text-ink-400 hover:text-white">
                <Camera className="h-3 w-3" /> Add your Spotify, Apple Music, SoundCloud and YouTube links
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Songs */}
      <section className="panel p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <h2 className="font-display text-xl font-bold text-white">Songs</h2>
          <div role="tablist" className="grid grid-cols-2 rounded-xl border border-ink-700 bg-ink-850 p-1 text-sm">
            {[
              ['popular', 'Popular'],
              ['newest', 'Newest'],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={sort === k}
                onClick={() => setSort(k)}
                className={`rounded-lg px-3 py-1.5 font-semibold ${sort === k ? 'bg-ink-700 text-white' : 'text-ink-400 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {sorted.length ? (
          <ul className="flex flex-col gap-1">
            {sorted.map((t, i) => (
              <SongRow key={t.id} track={t} index={i} list={sorted} liked={liked.has(t.id)} onLike={onLike} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-ink-400">Your songs show up here once they're in the Library.</p>
            <Link href="/library" className="btn-primary">Go to Library</Link>
          </div>
        )}
      </section>

      {editing && (
        <EditProfile
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={(p) => setProfile((old) => ({ ...old, ...p }))}
        />
      )}
    </div>
  );
}
