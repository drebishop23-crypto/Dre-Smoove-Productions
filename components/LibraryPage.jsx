'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  ChevronLeft,
  Folder,
  FolderPlus,
  Heart,
  Image as ImageIcon,
  ListFilter,
  ListMusic,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePlayer } from '@/components/PlayerProvider';
import SongRow from '@/components/SongRow';
import TrackArt from '@/components/TrackArt';
import Modal from '@/components/Modal';
import { UploadModal } from '@/components/SongModals';
import { useSongActions } from '@/components/SongActions';
import { formatTime } from '@/lib/audio';

const TABS = [
  ['songs', 'Songs'],
  ['playlists', 'Playlists'],
  ['workspaces', 'Workspaces'],
  ['projects', 'Studio Projects'],
  ['art', 'Cover Art'],
  ['hooks', 'Hooks'],
  ['liked-hooks', 'Liked Hooks'],
  ['history', 'History'],
  ['trash', 'Trash'],
];

const FILTERS = [
  ['liked', 'Liked', (t) => t.liked],
  ['public', 'Public', (t) => t.is_public],
  ['uploads', 'Uploads', (t) => t.source === 'upload'],
  ['ai', 'AI songs', (t) => t.source === 'ai'],
  ['versions', 'Edits & remixes', (t) => !!t.parent_id || !!t.edit_note],
  ['lyrics', 'Has lyrics', (t) => !!t.lyrics],
  ['instrumental', 'Instrumental', (t) => !!t.instrumental],
  ['pinned', 'Pinned', (t) => !!t.pinned],
];

const SORTS = {
  new: ['Newest', (a, b) => String(b.created_at).localeCompare(String(a.created_at))],
  old: ['Oldest', (a, b) => String(a.created_at).localeCompare(String(b.created_at))],
  plays: ['Most played', (a, b) => (b.plays || 0) - (a.plays || 0)],
  likes: ['Most liked', (a, b) => (b.likes || 0) - (a.likes || 0)],
  title: ['Title A–Z', (a, b) => a.title.localeCompare(b.title)],
};

function Dropdown({ label, icon: Icon, children, count }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${count ? 'bg-white text-ink-950' : 'border border-ink-700 bg-ink-850 text-ink-100'}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon className="h-4 w-4" /> {label}
        {count ? ` (${count})` : ''} <ChevronDown className="h-4 w-4" />
      </button>
      {open && <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-ink-700 bg-ink-850 p-1.5 shadow-2xl" onClick={(e) => e.stopPropagation()}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function Empty({ icon: Icon = ListMusic, children, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800 text-ink-300">
        <Icon className="h-6 w-6" />
      </div>
      <p className="max-w-sm text-sm text-ink-400">{children}</p>
      {action}
    </div>
  );
}

function CardGrid({ children }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}

function Collage({ tracks }) {
  const four = tracks.slice(0, 4);
  if (four.length < 4) return <TrackArt track={four[0] || { id: 'empty', title: '♪' }} size={400} rounded="rounded-xl" className="!h-auto !w-full aspect-square" />;
  return (
    <div className="grid aspect-square w-full grid-cols-2 overflow-hidden rounded-xl">
      {four.map((t) => (
        <TrackArt key={t.id} track={t} size={200} rounded="" className="!h-auto !w-full aspect-square" />
      ))}
    </div>
  );
}

/* ------------------------------ Hooks ------------------------------ */
function HookModal({ songs, onClose, onCreated }) {
  const [trackId, setTrackId] = useState(songs[0]?.id || '');
  const track = songs.find((s) => s.id === trackId);
  const dur = Number(track?.duration) || 60;
  const [range, setRange] = useState([0, 15]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { playClip } = usePlayer();
  const save = async () => {
    setBusy(true);
    try {
      const { hook } = await api.createHook({ track_id: trackId, start_sec: range[0], end_sec: range[1], title: title || track?.title });
      onCreated({ ...hook, track });
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="New hook"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={() => track && playClip(track, range[0], range[1])}>
            <Play className="h-4 w-4" /> Preview
          </button>
          <button type="button" className="btn-primary" disabled={!trackId || busy} onClick={save}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save hook
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-400">A hook is the best 5 to 60 seconds of a song, saved so you can play it, share it, or use it for short videos.</p>
        <select className="field" value={trackId} onChange={(e) => { setTrackId(e.target.value); setRange([0, 15]); }}>
          {songs.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <input className="field" placeholder="Hook name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <div className="mb-1 flex justify-between text-xs text-ink-300"><span>Start</span><span className="font-mono text-gold">{formatTime(range[0])} – {formatTime(range[1])}</span></div>
          <input type="range" min={0} max={Math.max(1, dur - 5)} value={range[0]} className="w-full" onChange={(e) => { const s = Number(e.target.value); setRange([s, Math.min(dur, Math.max(s + 5, Math.min(range[1], s + 60)))]); }} />
          <div className="mb-1 mt-2 text-xs text-ink-300">End</div>
          <input type="range" min={range[0] + 5} max={Math.min(dur, range[0] + 60)} value={range[1]} className="w-full" onChange={(e) => setRange([range[0], Number(e.target.value)])} />
        </div>
        {err && <p className="text-sm text-neon-pink">{err}</p>}
      </div>
    </Modal>
  );
}

function HookCard({ hook, onLike, onDelete }) {
  const { playClip, isCurrent, playing, toggle, time } = usePlayer();
  const t = hook.track;
  const active = isCurrent(t.id) && playing && time >= hook.start_sec - 0.5 && time <= hook.end_sec + 0.5;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-850">
      <div className="relative">
        <TrackArt track={t} size={400} rounded="" className="!h-auto !w-full aspect-[4/5] object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
        <button type="button" onClick={() => (active ? toggle() : playClip(t, Number(hook.start_sec), Number(hook.end_sec)))} className="absolute inset-0 flex items-center justify-center" aria-label={active ? 'Pause hook' : 'Play hook'}>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-ink-950 shadow-xl transition group-hover:scale-105">
            {active ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
          </span>
        </button>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="truncate text-sm font-bold text-white">{hook.title || t.title}</div>
          <div className="font-mono text-[11px] text-ink-300">{formatTime(hook.start_sec)} – {formatTime(hook.end_sec)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between px-2 py-1.5">
        <button type="button" className={`icon-btn ${hook.liked ? 'text-neon-pink' : ''}`} onClick={onLike} aria-label={hook.liked ? 'Unlike hook' : 'Like hook'}>
          <Heart className="h-4 w-4" fill={hook.liked ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="icon-btn" onClick={onDelete} aria-label="Delete hook">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ Page ------------------------------ */
export default function LibraryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get('tab') || 'songs';
  const openId = params.get('id');
  const { playTrack } = usePlayer();

  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState([]);
  const [sort, setSort] = useState('new');
  const [showUpload, setShowUpload] = useState(false);

  const [projects, setProjects] = useState(null);
  const [hooks, setHooks] = useState(null);
  const [history, setHistory] = useState(null);
  const [hookModal, setHookModal] = useState(false);
  const [trash, setTrash] = useState(null);
  const [trashBusy, setTrashBusy] = useState(null);

  const { actions, modals } = useSongActions({
    onUpdate: (t) => {
      setSongs((s) => s.map((x) => (x.id === t.id ? { ...x, ...t } : x)));
      setHistory((h) => h && h.map((x) => (x.id === t.id ? { ...x, ...t } : x)));
    },
    onRemove: (t) => {
      setSongs((s) => s.filter((x) => x.id !== t.id));
      setTrash((tr) => (tr ? [{ ...t, deleted_at: new Date().toISOString() }, ...tr] : tr));
    },
    onRestore: (t) => {
      setSongs((s) => [t, ...s.filter((x) => x.id !== t.id)]);
      setTrash((tr) => tr && tr.filter((x) => x.id !== t.id));
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { tracks } = await api.listTracks();
      setSongs(tracks);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === 'projects' && projects === null) api.listProjects().then((r) => setProjects(r.projects)).catch((e) => { setProjects([]); setError(e.message); });
    if ((tab === 'hooks' || tab === 'liked-hooks') && hooks === null) api.listHooks().then((r) => setHooks(r.hooks)).catch((e) => { setHooks([]); setError(e.message); });
    if (tab === 'trash') api.listTracks({ trash: 1 }).then((r) => setTrash(r.tracks)).catch((e) => { setTrash([]); setError(e.message); });
    if (tab === 'history') api.history().then((r) => setHistory(r.history)).catch((e) => { setHistory([]); setError(e.message); });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (t, id) => router.push(`/library?tab=${t}${id ? `&id=${id}` : ''}`);

  const filtered = useMemo(() => {
    let list = songs;
    for (const f of filters) {
      const fn = FILTERS.find(([k]) => k === f)?.[2];
      if (fn) list = list.filter(fn);
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => [t.title, t.artist, t.prompt, ...(t.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(q));
    return [...list].sort(SORTS[sort][1]);
  }, [songs, filters, query, sort]);

  const toggleFilter = (k) => setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const songList = (list, emptyText) =>
    loading && !songs.length ? (
      <p className="flex items-center gap-2 px-2 py-10 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading</p>
    ) : list.length ? (
      <ul className="flex flex-col gap-1">
        {list.map((t) => (
          <SongRow key={t.id} track={t} list={list} actions={actions} />
        ))}
      </ul>
    ) : (
      <Empty>{emptyText}</Empty>
    );

  const searchBar = (
    <div className="relative min-w-[10rem] flex-1">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
      <input type="search" className="field h-10 rounded-full pl-10" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
    </div>
  );

  /* ---------------- tab bodies ---------------- */
  let body = null;

  if (tab === 'songs') {
    body = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          {searchBar}
          <Dropdown label="Filters" icon={ListFilter} count={filters.length}>
            {(close) => (
              <>
                {FILTERS.map(([k, label]) => (
                  <button key={k} type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-100 hover:bg-ink-700" onClick={() => toggleFilter(k)}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${filters.includes(k) ? 'border-gold bg-gold text-ink-950' : 'border-ink-500'}`}>{filters.includes(k) && <Check className="h-3 w-3" />}</span>
                    {label}
                  </button>
                ))}
                {filters.length > 0 && (
                  <button type="button" className="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs text-ink-400 hover:bg-ink-700" onClick={() => { setFilters([]); close(); }}>
                    Clear filters
                  </button>
                )}
              </>
            )}
          </Dropdown>
          <Dropdown label={SORTS[sort][0]} icon={ArrowDownUp}>
            {(close) =>
              Object.entries(SORTS).map(([k, [label]]) => (
                <button key={k} type="button" className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-ink-100 hover:bg-ink-700" onClick={() => { setSort(k); close(); }}>
                  {label} {sort === k && <Check className="h-4 w-4 text-gold" />}
                </button>
              ))
            }
          </Dropdown>
          <div className="flex gap-1.5">
            {['liked', 'public', 'uploads'].map((k) => (
              <button key={k} type="button" onClick={() => toggleFilter(k)} aria-pressed={filters.includes(k)} className={`h-10 rounded-full px-4 text-sm font-semibold capitalize transition ${filters.includes(k) ? 'bg-white text-ink-950' : 'border border-ink-700 bg-ink-850 text-ink-200 hover:text-white'}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between px-1 text-xs text-ink-400">
          <span className="font-mono">{filtered.length} songs · {formatTime(filtered.reduce((s, t) => s + (Number(t.duration) || 0), 0))}</span>
          <div className="flex gap-1">
            <button type="button" className="btn px-2 py-1 text-xs text-ink-300 hover:text-white" disabled={!filtered.length} onClick={() => playTrack(filtered[0], filtered)}>
              <Play className="h-3.5 w-3.5" fill="currentColor" /> Play all
            </button>
            <button type="button" className="btn px-2 py-1 text-xs text-ink-300 hover:text-white" disabled={filtered.length < 2} onClick={() => { const s = [...filtered].sort(() => Math.random() - 0.5); playTrack(s[0], s); }}>
              <Shuffle className="h-3.5 w-3.5" /> Shuffle
            </button>
          </div>
        </div>
        {error && <p className="px-2 text-sm text-neon-pink">{error}</p>}
        {songList(filtered, query || filters.length ? 'Nothing matches. Try clearing the filters.' : 'No songs yet. Create one or upload your recordings.')}
      </>
    );
  }

  if (tab === 'playlists') {
    const pl = openId ? actions.playlists.find((p) => p.id === openId) : null;
    if (pl) {
      const byId = Object.fromEntries(songs.map((s) => [s.id, s]));
      const list = pl.track_ids.map((id) => byId[id]).filter(Boolean);
      body = (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost rounded-full" onClick={() => go('playlists')}><ChevronLeft className="h-4 w-4" /> Playlists</button>
            <h2 className="mr-auto font-display text-xl font-bold text-white">{pl.name}</h2>
            <button type="button" className="btn-ghost rounded-full" disabled={!list.length} onClick={() => playTrack(list[0], list)}><Play className="h-4 w-4" fill="currentColor" /> Play</button>
            <button
              type="button"
              className="btn-ghost rounded-full"
              onClick={async () => {
                const name = window.prompt('Rename playlist', pl.name);
                if (!name?.trim()) return;
                const { playlist } = await api.updatePlaylist(pl.id, { name: name.trim() });
                actions.setPlaylists((ps) => ps.map((p) => (p.id === playlist.id ? playlist : p)));
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn-ghost rounded-full hover:!text-neon-pink"
              onClick={async () => {
                if (!window.confirm(`Delete the playlist "${pl.name}"? The songs stay in your library.`)) return;
                await api.deletePlaylist(pl.id);
                actions.setPlaylists((ps) => ps.filter((p) => p.id !== pl.id));
                go('playlists');
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {list.length ? (
            <ul className="flex flex-col gap-1">
              {list.map((t) => (
                <div key={t.id} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1"><SongRow track={t} list={list} actions={actions} /></div>
                  <button
                    type="button"
                    className="icon-btn shrink-0"
                    aria-label={`Remove ${t.title} from playlist`}
                    onClick={async () => {
                      const { playlist } = await api.updatePlaylist(pl.id, { remove: t.id });
                      actions.setPlaylists((ps) => ps.map((p) => (p.id === playlist.id ? playlist : p)));
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </ul>
          ) : (
            <Empty>This playlist is empty. Use ••• on any song and choose Add to Playlist.</Empty>
          )}
        </>
      );
    } else {
      body = (
        <CardGrid>
          <button
            type="button"
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white"
            onClick={async () => {
              const name = window.prompt('Playlist name');
              if (!name?.trim()) return;
              const { playlist } = await api.createPlaylist(name.trim());
              actions.setPlaylists((ps) => [...ps, playlist]);
            }}
          >
            <Plus className="h-7 w-7" /> New playlist
          </button>
          {actions.playlists.map((p) => {
            const tracks = p.track_ids.map((id) => songs.find((s) => s.id === id)).filter(Boolean);
            return (
              <button key={p.id} type="button" className="flex flex-col gap-2 text-left" onClick={() => go('playlists', p.id)}>
                <Collage tracks={tracks} />
                <div>
                  <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                  <div className="text-xs text-ink-400">{p.track_ids.length} songs</div>
                </div>
              </button>
            );
          })}
        </CardGrid>
      );
    }
  }

  if (tab === 'workspaces') {
    const ws = openId === 'main' ? { id: '', name: 'My Workspace' } : openId ? actions.workspaces.find((w) => w.id === openId) : null;
    if (ws) {
      const list = songs.filter((s) => (ws.id ? s.workspace_id === ws.id : !s.workspace_id));
      body = (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost rounded-full" onClick={() => go('workspaces')}><ChevronLeft className="h-4 w-4" /> Workspaces</button>
            <h2 className="mr-auto font-display text-xl font-bold text-white">{ws.name}</h2>
            <Link href="/create" className="btn-ghost rounded-full"><Sparkles className="h-4 w-4 text-gold" /> Create here</Link>
            {ws.id && (
              <>
                <button
                  type="button"
                  className="btn-ghost rounded-full"
                  onClick={async () => {
                    const name = window.prompt('Rename workspace', ws.name);
                    if (!name?.trim()) return;
                    const { workspace } = await api.renameWorkspace(ws.id, name.trim());
                    actions.setWorkspaces((w) => w.map((x) => (x.id === workspace.id ? workspace : x)));
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn-ghost rounded-full hover:!text-neon-pink"
                  onClick={async () => {
                    if (!window.confirm(`Delete the workspace "${ws.name}"? Its songs move back to My Workspace.`)) return;
                    await api.deleteWorkspace(ws.id);
                    actions.setWorkspaces((w) => w.filter((x) => x.id !== ws.id));
                    setSongs((s) => s.map((x) => (x.workspace_id === ws.id ? { ...x, workspace_id: null } : x)));
                    go('workspaces');
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {songList(list, 'No songs in this workspace yet. Use ••• › Manage › Move to Workspace on any song.')}
        </>
      );
    } else {
      const cards = [{ id: 'main', name: 'My Workspace', list: songs.filter((s) => !s.workspace_id) }, ...actions.workspaces.map((w) => ({ id: w.id, name: w.name, list: songs.filter((s) => s.workspace_id === w.id) }))];
      body = (
        <CardGrid>
          <button
            type="button"
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white"
            onClick={async () => {
              const name = window.prompt('Workspace name');
              if (!name?.trim()) return;
              const { workspace } = await api.createWorkspace(name.trim());
              actions.setWorkspaces((w) => [...w, workspace]);
            }}
          >
            <FolderPlus className="h-7 w-7" /> New workspace
          </button>
          {cards.map((c) => (
            <button key={c.id} type="button" className="flex flex-col gap-2 text-left" onClick={() => go('workspaces', c.id)}>
              <Collage tracks={c.list} />
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-gold" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{c.name}</div>
                  <div className="text-xs text-ink-400">{c.list.length} songs</div>
                </div>
              </div>
            </button>
          ))}
        </CardGrid>
      );
    }
  }

  if (tab === 'projects') {
    body =
      projects === null ? (
        <p className="flex items-center gap-2 px-2 py-10 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading projects</p>
      ) : (
        <CardGrid>
          <Link href="/studio?new=1" className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-600 text-ink-300 hover:border-ink-400 hover:text-white">
            <Plus className="h-7 w-7" /> New project
          </Link>
          {projects.map((p) => {
            const lanes = p.data?.tracks || [];
            return (
              <div key={p.id} className="group flex flex-col gap-2">
                <Link href={`/studio/${p.id}`} className="flex aspect-[4/3] flex-col gap-1 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 p-2">
                  {lanes.slice(0, 4).map((l, i) => (
                    <div key={l.id} className="relative h-5 rounded bg-ink-800">
                      {(l.clips || []).map((c) => (
                        <span key={c.id} className="absolute inset-y-0 rounded" style={{ left: `${Math.min(90, (c.start / 240) * 100)}%`, width: `${Math.max(6, Math.min(100, (c.duration / 240) * 100))}%`, background: ['#2ee6d6', '#e8b94a', '#ff4fa3', '#9d7bff'][i % 4], opacity: 0.7 }} />
                      ))}
                    </div>
                  ))}
                  {!lanes.length && <span className="m-auto text-xs text-ink-500">Empty project</span>}
                </Link>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                    <div className="text-xs text-ink-400">{new Date(p.updated_at).toLocaleDateString()}</div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8 shrink-0"
                    aria-label={`Delete ${p.name}`}
                    onClick={async () => {
                      if (!window.confirm(`Delete the project "${p.name}"? Songs in your library are not affected.`)) return;
                      await api.deleteProject(p.id);
                      setProjects((ps) => ps.filter((x) => x.id !== p.id));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </CardGrid>
      );
  }

  if (tab === 'art') {
    const withArt = songs.filter((s) => s.artwork_url);
    const without = songs.filter((s) => !s.artwork_url);
    body = (
      <>
        {withArt.length ? (
          <CardGrid>
            {withArt.map((t) => (
              <div key={t.id} className="flex flex-col gap-2">
                <button type="button" className="group relative overflow-hidden rounded-2xl" onClick={() => actions.open('cover', t)}>
                  <img src={t.artwork_url} alt={`Cover art for ${t.title}`} className="aspect-square w-full object-cover transition group-hover:scale-[1.03]" />
                  <span className="absolute inset-x-2 bottom-2 rounded-full bg-ink-950/80 px-3 py-1 text-center text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">Make new art</span>
                </button>
                <div className="truncate text-sm font-semibold text-white">{t.title}</div>
              </div>
            ))}
          </CardGrid>
        ) : (
          <Empty icon={ImageIcon}>No cover art yet.</Empty>
        )}
        {without.length > 0 && (
          <div className="mt-6">
            <div className="label mb-3">Songs without cover art</div>
            <div className="flex flex-col gap-1">
              {without.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-850">
                  <TrackArt track={t} size={44} />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{t.title}</span>
                  <button type="button" className="btn-ghost rounded-full text-xs" onClick={() => actions.open('cover', t)}>
                    <Sparkles className="h-4 w-4 text-gold" /> Create Cover Art
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  if (tab === 'hooks' || tab === 'liked-hooks') {
    const list = (hooks || []).filter((h) => tab === 'hooks' || h.liked);
    body =
      hooks === null ? (
        <p className="flex items-center gap-2 px-2 py-10 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading hooks</p>
      ) : (
        <>
          {tab === 'hooks' && (
            <div className="flex justify-end">
              <button type="button" className="btn-ghost rounded-full" disabled={!songs.length} onClick={() => setHookModal(true)}>
                <Plus className="h-4 w-4" /> New hook
              </button>
            </div>
          )}
          {list.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {list.map((h) => (
                <HookCard
                  key={h.id}
                  hook={h}
                  onLike={async () => {
                    setHooks((hs) => hs.map((x) => (x.id === h.id ? { ...x, liked: !x.liked } : x)));
                    await api.updateHook(h.id, { liked: !h.liked }).catch(() => {});
                  }}
                  onDelete={async () => {
                    if (!window.confirm('Delete this hook? The song stays in your library.')) return;
                    await api.deleteHook(h.id);
                    setHooks((hs) => hs.filter((x) => x.id !== h.id));
                  }}
                />
              ))}
            </div>
          ) : (
            <Empty icon={Heart}>
              {tab === 'hooks' ? 'No hooks yet. Make one here, or select a part of a song in the Editor and choose Make Hook.' : 'Hooks you like show up here.'}
            </Empty>
          )}
          {hookModal && <HookModal songs={songs} onClose={() => setHookModal(false)} onCreated={(h) => setHooks((hs) => [h, ...(hs || [])])} />}
        </>
      );
  }

  if (tab === 'history') {
    body =
      history === null ? (
        <p className="flex items-center gap-2 px-2 py-10 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading history</p>
      ) : (
        songList(history, 'Songs you play show up here.')
      );
  }

  if (tab === 'trash') {
    const restore = async (t) => {
      setTrashBusy(t.id);
      try {
        const { track } = await api.restoreTrack(t.id);
        setTrash((tr) => tr.filter((x) => x.id !== t.id));
        setSongs((s) => [track, ...s.filter((x) => x.id !== track.id)]);
      } catch (e) {
        setError(e.message);
      } finally {
        setTrashBusy(null);
      }
    };
    const destroy = async (t, ask = true) => {
      if (ask && !window.confirm(`Delete "${t.title}" forever? This can't be undone.`)) return;
      setTrashBusy(t.id);
      try {
        await api.deleteForever(t.id);
        setTrash((tr) => tr.filter((x) => x.id !== t.id));
      } catch (e) {
        setError(e.message);
      } finally {
        setTrashBusy(null);
      }
    };
    body =
      trash === null ? (
        <p className="flex items-center gap-2 px-2 py-10 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading Trash</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
            <p className="text-sm text-ink-300">Songs here can be restored any time. Deleting forever also removes their audio, cover, video and stems.</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost rounded-full"
                disabled={!trash.length || !!trashBusy}
                onClick={async () => {
                  setTrashBusy('all');
                  for (const t of [...trash]) await restore(t);
                  setTrashBusy(null);
                }}
              >
                <RotateCcw className="h-4 w-4" /> Restore all
              </button>
              <button
                type="button"
                className="btn-ghost rounded-full hover:!text-neon-pink"
                disabled={!trash.length || !!trashBusy}
                onClick={async () => {
                  if (!window.confirm(`Delete all ${trash.length} songs in Trash forever? This can't be undone.`)) return;
                  setTrashBusy('all');
                  for (const t of [...trash]) await destroy(t, false);
                  setTrashBusy(null);
                }}
              >
                <Trash2 className="h-4 w-4" /> Empty Trash
              </button>
            </div>
          </div>
          {error && <p className="px-2 text-sm text-neon-pink">{error}</p>}
          {trash.length ? (
            <ul className="flex flex-col gap-1">
              {trash.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-ink-850">
                  <TrackArt track={t} size={56} rounded="rounded-xl" className="opacity-70" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-white">{t.title}</div>
                    <div className="truncate text-xs text-ink-400">
                      Deleted {new Date(t.deleted_at).toLocaleDateString()} · {formatTime(t.duration)}
                    </div>
                  </div>
                  {trashBusy === t.id ? (
                    <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
                  ) : (
                    <>
                      <button type="button" className="btn-ghost rounded-full text-xs" onClick={() => restore(t)} disabled={!!trashBusy}>
                        <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Restore</span>
                      </button>
                      <button type="button" className="btn-ghost rounded-full text-xs hover:!text-neon-pink" onClick={() => destroy(t)} disabled={!!trashBusy} aria-label={`Delete ${t.title} forever`}>
                        <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete forever</span>
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Trash2}>Trash is empty. Songs you delete wait here until you restore them or delete them forever.</Empty>
          )}
        </>
      );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white">Library</h1>
        <div className="flex gap-2">
          <Link href="/studio" className="btn-ghost h-10 rounded-full">
            <SlidersHorizontal className="h-4 w-4" /> <span className="hidden sm:inline">Studio</span>
          </Link>
          <button type="button" className="btn-ghost h-10 rounded-full" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4" /> Audio
          </button>
          <button type="button" className={`btn-ghost h-10 w-10 rounded-full !px-0 ${tab === 'trash' ? '!border-white !text-white' : ''}`} onClick={() => go('trash')} aria-label="Trash" title="Trash">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <nav aria-label="Library sections" className="-mx-4 flex gap-1 overflow-x-auto border-b border-ink-800 px-4 md:mx-0 md:px-0">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => go(k)}
            aria-current={tab === k ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-3 pb-3 pt-1 text-sm font-semibold transition ${tab === k ? 'border-white text-white' : 'border-transparent text-ink-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-3">{body}</div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onUploaded={(t) => setSongs((s) => [t, ...s])} />}
      {modals}
    </div>
  );
}
