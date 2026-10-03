'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Loader2, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import TrackArt from '@/components/TrackArt';
import { formatTime } from '@/lib/audio';

const COLORS = ['#2ee6d6', '#e8b94a', '#ff4fa3', '#9d7bff', '#ffc15e'];

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ProjectThumb({ project }) {
  const lanes = project.data?.tracks || [];
  const end = Math.max(30, ...lanes.flatMap((l) => (l.clips || []).map((c) => c.start + c.duration)));
  return (
    <div className="flex h-full flex-col gap-1.5 p-2">
      {lanes.slice(0, 5).map((l, i) => (
        <div key={l.id} className="relative h-6 rounded bg-ink-800/80">
          {(l.clips || []).map((c) => (
            <span key={c.id} className="absolute inset-y-0 truncate rounded px-1 text-[9px] font-semibold uppercase leading-6 text-ink-950" style={{ left: `${(c.start / end) * 100}%`, width: `${Math.max(4, (c.duration / end) * 100)}%`, background: COLORS[i % COLORS.length] }}>
              {c.name}
            </span>
          ))}
        </div>
      ))}
      {!lanes.length && <span className="m-auto text-xs text-ink-500">Empty</span>}
    </div>
  );
}

export default function StudioHome() {
  const router = useRouter();
  const params = useSearchParams();
  const [projects, setProjects] = useState(null);
  const [songs, setSongs] = useState([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const newProject = async (track) => {
    setBusy(track?.id || 'new');
    try {
      const data = track
        ? {
            tracks: [
              {
                id: crypto.randomUUID(),
                name: track.title,
                volume: 1,
                muted: false,
                solo: false,
                clips: [{ id: crypto.randomUUID(), trackId: track.id, path: track.audio_path, name: track.title, start: 0, offset: 0, duration: Number(track.duration) || 0 }],
              },
            ],
          }
        : { tracks: [] };
      const { project } = await api.createProject({ name: track?.title || 'Untitled project', data });
      router.push(`/studio/${project.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  useEffect(() => {
    if (params.get('new')) {
      newProject(null);
      return;
    }
    api.listProjects().then((r) => setProjects(r.projects)).catch((e) => { setError(e.message); setProjects([]); });
    api.listTracks().then((r) => setSongs(r.tracks)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = songs
    .filter((s) => !q.trim() || [s.title, ...(s.tags || [])].join(' ').toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (sort === 'new' ? String(b.created_at).localeCompare(String(a.created_at)) : a.title.localeCompare(b.title)));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="label mb-1">Studio</div>
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Multitrack Studio</h1>
        </div>
        <Link href="/library?tab=projects" className="btn-ghost rounded-full">All projects</Link>
      </header>
      {error && <p className="text-sm text-neon-pink">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-white">Pick up where you left off</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => newProject(null)} disabled={!!busy} className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border border-ink-700 bg-ink-850 text-white hover:border-ink-500">
              {busy === 'new' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-7 w-7" />}
              <span className="text-sm font-semibold">New empty project</span>
            </button>
            {projects === null ? (
              <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-ink-800"><Loader2 className="h-5 w-5 animate-spin text-ink-400" /></div>
            ) : (
              projects.slice(0, 7).map((p) => (
                <div key={p.id} className="group relative">
                  <Link href={`/studio/${p.id}`} className="block aspect-[4/3] overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 hover:border-ink-500">
                    <ProjectThumb project={p} />
                  </Link>
                  <div className="mt-1.5 flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                      <div className="text-xs text-ink-500">{timeAgo(p.updated_at)}</div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn h-7 w-7"
                      aria-label={`Delete ${p.name}`}
                      onClick={async () => {
                        if (!window.confirm(`Delete "${p.name}"?`)) return;
                        await api.deleteProject(p.id);
                        setProjects((ps) => ps.filter((x) => x.id !== p.id));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-semibold text-white">Or start from one of your songs</h2>
          <div className="panel flex min-w-0 flex-col p-3">
            <div className="mb-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input type="search" className="field rounded-full py-2 pl-9" placeholder="Search your songs…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <label className="relative">
                <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className="field appearance-none rounded-full py-2 pl-3 pr-8">
                  <option value="new">New</option>
                  <option value="title">A–Z</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              </label>
            </div>
            <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
              {list.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-850">
                  <TrackArt track={s} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{s.title}</div>
                    <div className="truncate text-xs text-ink-400">{(s.tags || []).join(', ') || s.prompt || '—'} · {formatTime(s.duration)}</div>
                  </div>
                  <button type="button" className="btn-ghost shrink-0 rounded-full text-xs" disabled={!!busy} onClick={() => newProject(s)}>
                    {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <SlidersHorizontal className="h-4 w-4" />} Edit in Studio
                  </button>
                </li>
              ))}
              {!list.length && <li className="px-2 py-6 text-sm text-ink-500">No songs found.</li>}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
