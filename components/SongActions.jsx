'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePlayer } from '@/components/PlayerProvider';
import CoverGenerator from '@/components/CoverGenerator';
import ReleaseModal from '@/components/ReleaseModal';
import { EditModal, LyricsModal, ShareModal, StemsModal } from '@/components/SongModals';
import { downloadTrack } from '@/lib/audio';

// Everything the ••• song menu can do, plus the dialogs it opens.
// Pages pass callbacks so their own song lists stay up to date.
export function useSongActions({ onUpdate, onRemove, onRestore } = {}) {
  const router = useRouter();
  const { syncTrack, removeTrack, addToQueue } = usePlayer();
  const [playlists, setPlaylists] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [modal, setModal] = useState(null); // { type, track }
  const [toast, setToast] = useState(null);

  const flash = useCallback((msg, action) => {
    const id = Date.now();
    setToast({ id, msg, action });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), action ? 6000 : 2600);
  }, []);

  const loadLists = useCallback(async () => {
    if (api.peek('playlists')) setPlaylists(api.peek('playlists').playlists);
    if (api.peek('workspaces')) setWorkspaces(api.peek('workspaces').workspaces);
    const [p, w] = await Promise.allSettled([api.listPlaylists(), api.listWorkspaces()]);
    if (p.status === 'fulfilled') setPlaylists(p.value.playlists);
    if (w.status === 'fulfilled') setWorkspaces(w.value.workspaces);
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const updated = useCallback(
    (t) => {
      syncTrack(t);
      onUpdate?.(t);
    },
    [syncTrack, onUpdate]
  );

  const patch = async (track, body, msg) => {
    try {
      const { track: t } = await api.updateTrack(track.id, body);
      updated(t);
      if (msg) flash(msg);
      return t;
    } catch (e) {
      flash(e.message);
    }
  };

  const stat = async (track, action) => {
    // Optimistic: flip the thumbs right away
    const next = { ...track };
    if (action === 'like') Object.assign(next, { liked: true, disliked: false });
    if (action === 'unlike') next.liked = false;
    if (action === 'dislike') Object.assign(next, { liked: false, disliked: true });
    if (action === 'undislike') next.disliked = false;
    updated(next);
    try {
      const res = await api.trackStat(track.id, action);
      updated({ ...next, ...res });
    } catch (e) {
      updated(track);
      flash(e.message);
    }
  };

  const actions = {
    playlists,
    workspaces,
    flash,
    reloadLists: loadLists,
    setPlaylists,
    setWorkspaces,
    open: (type, track) => setModal({ type, track }),
    like: (t) => stat(t, t.liked ? 'unlike' : 'like'),
    dislike: (t) => stat(t, t.disliked ? 'undislike' : 'dislike'),
    publish: (t) => patch(t, { is_public: !t.is_public }, t.is_public ? 'Song is private now' : 'Published'),
    toggle: (t, field, label) => patch(t, { [field]: !t[field] }, `${label} ${t[field] ? 'off' : 'on'}`),
    moveTo: (t, ws) => patch(t, { workspace_id: ws?.id || null }, `Moved to ${ws?.name || 'My Workspace'}`),
    queue: (t) => {
      addToQueue(t);
      flash('Added to queue');
    },
    download: async (t, format) => {
      try {
        flash('Preparing download…');
        await downloadTrack(t, format);
      } catch (e) {
        flash(e.message);
      }
    },
    addToPlaylist: async (t, playlist) => {
      try {
        const { playlist: p } = await api.updatePlaylist(playlist.id, { add: t.id });
        setPlaylists((ps) => ps.map((x) => (x.id === p.id ? p : x)));
        flash(`Added to ${p.name}`);
      } catch (e) {
        flash(e.message);
      }
    },
    newPlaylistWith: async (t) => {
      const name = window.prompt('Playlist name');
      if (!name?.trim()) return;
      try {
        const { playlist } = await api.createPlaylist(name.trim());
        const { playlist: p } = await api.updatePlaylist(playlist.id, { add: t.id });
        setPlaylists((ps) => [...ps, p]);
        flash(`Added to ${p.name}`);
      } catch (e) {
        flash(e.message);
      }
    },
    // Moves the song to Trash. It can be restored from Library › Trash.
    remove: async (t) => {
      try {
        await api.deleteTrack(t.id);
        removeTrack(t.id);
        onRemove?.(t);
        flash(`Moved “${t.title}” to Trash`, {
          label: 'Undo',
          run: async () => {
            const { track } = await api.restoreTrack(t.id);
            onRestore?.(track);
            flash(`Restored “${track.title}”`);
          },
        });
      } catch (e) {
        flash(/deleted_at/.test(e.message) ? 'Run the Trash update (update-5.sql) in Supabase first.' : e.message);
      }
    },
    remix: (kind, t) => router.push(`/create?remix=${kind}&from=${t.id}`),
    edit: (tool, t) => router.push(`/editor/${t.id}${tool ? `?tool=${tool}` : ''}`),
    openInStudio: async (t) => {
      try {
        flash('Opening in Studio…');
        const { project } = await api.createProject({
          name: t.title,
          data: {
            tracks: [
              {
                id: crypto.randomUUID(),
                name: t.title,
                volume: 1,
                muted: false,
                solo: false,
                clips: [{ id: crypto.randomUUID(), trackId: t.id, path: t.audio_path, name: t.title, start: 0, offset: 0, duration: Number(t.duration) || 0 }],
              },
            ],
          },
        });
        router.push(`/studio/${project.id}`);
      } catch (e) {
        flash(e.message);
      }
    },
  };

  const close = () => setModal(null);
  const m = modal;
  const modals = (
    <>
      {m?.type === 'details' && <EditModal track={m.track} onClose={close} onSaved={(t) => updated(t)} />}
      {m?.type === 'lyrics' && (
        <LyricsModal track={m.track} onClose={close} onSaved={updated} onEdit={() => setModal({ type: 'details', track: m.track })} />
      )}
      {m?.type === 'cover' && (
        <CoverGenerator
          target="track"
          trackId={m.track.id}
          initialPrompt={[m.track.title, (m.track.tags || [])[0]].filter(Boolean).join(', ')}
          onClose={close}
          onSaved={(res) => res.track && updated(res.track)}
        />
      )}
      {m?.type === 'release' && <ReleaseModal track={m.track} onClose={close} onSaved={updated} />}
      {m?.type === 'stems' && <StemsModal track={m.track} onClose={close} onSaved={updated} />}
      {(m?.type === 'share' || m?.type === 'collab') && (
        <ShareModal
          track={m.track}
          collab={m.type === 'collab'}
          onClose={close}
          onPublish={async () => {
            const t = await patch(m.track, { is_public: true }, 'Published');
            if (t) setModal({ ...m, track: t });
          }}
        />
      )}
      {toast && (
        <div role="status" className="fixed left-1/2 top-5 z-[80] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-white shadow-2xl">
          <span className="truncate">{toast.msg}</span>
          {toast.action && (
            <button
              type="button"
              className="shrink-0 font-semibold text-gold hover:underline"
              onClick={() => {
                const a = toast.action;
                setToast(null);
                a.run().catch((e) => flash(e.message));
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </>
  );

  return { actions, modals };
}
