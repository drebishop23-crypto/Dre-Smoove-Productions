'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownUp,
  AudioLines,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Disc3,
  FileAudio,
  FileText,
  ImagePlus,
  ListMusic,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Shuffle,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePlayer } from '@/components/PlayerProvider';
import TrackArt from '@/components/TrackArt';
import { decodeFromFile, downloadTrack, formatTime, peaksFromBuffer } from '@/lib/audio';

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.aif,.aiff';

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function titleFromFile(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Modal shell                                                         */
/* ------------------------------------------------------------------ */
function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-ink-700 bg-ink-900 shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
          <h2 className="font-display text-base font-bold text-white">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-800 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */
function UploadModal({ onClose, onUploaded }) {
  const [items, setItems] = useState([]);
  const [tags, setTags] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (fileList) => {
    const files = [...fileList].filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|aiff?)$/i.test(f.name));
    setItems((cur) => [
      ...cur,
      ...files.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, title: titleFromFile(file.name), status: 'ready' })),
    ]);
  };

  const update = (key, patch) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const start = async () => {
    setRunning(true);
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    for (const item of items) {
      if (item.status === 'done') continue;
      update(item.key, { status: 'uploading', error: null });
      try {
        let peaks = null;
        let duration = null;
        try {
          const buf = await decodeFromFile(item.file);
          peaks = peaksFromBuffer(buf);
          duration = Math.round(buf.duration * 10) / 10;
        } catch {}
        const { track } = await api.uploadTrack(item.file, {
          title: item.title || titleFromFile(item.file.name),
          tags: tagList,
          release_date: releaseDate || null,
          peaks,
          duration,
        });
        update(item.key, { status: 'done' });
        onUploaded(track);
      } catch (e) {
        update(item.key, { status: 'error', error: e.message });
      }
    }
    setRunning(false);
  };

  const remaining = items.filter((i) => i.status !== 'done').length;
  const allDone = items.length > 0 && remaining === 0;

  return (
    <Modal
      title="Upload recordings"
      onClose={running ? () => {} : onClose}
      wide
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={running}>
            {allDone ? 'Done' : 'Cancel'}
          </button>
          {!allDone && (
            <button type="button" className="btn-primary" onClick={start} disabled={running || !remaining}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {running ? 'Uploading' : `Upload ${remaining || ''} ${remaining === 1 ? 'track' : 'tracks'}`}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            drag ? 'border-neon-cyan bg-neon-cyan/5' : 'border-ink-600 hover:border-ink-400'
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800 text-neon-cyan">
            <AudioLines className="h-6 w-6" />
          </div>
          <span className="font-semibold text-white">Drop audio files here or click to browse</span>
          <span className="text-xs text-ink-400">WAV, MP3, M4A, FLAC, AIFF · any length</span>
        </button>
        <input
          ref={inputRef}
          id="upload-files"
          type="file"
          accept={AUDIO_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5">
                <FileAudio className="h-4 w-4 shrink-0 text-ink-400" />
                <input
                  id={`upload-title-${i.key}`}
                  aria-label="Track title"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                  value={i.title}
                  disabled={i.status !== 'ready' && i.status !== 'error'}
                  onChange={(e) => update(i.key, { title: e.target.value })}
                />
                <span className="hidden font-mono text-[11px] text-ink-500 sm:inline">
                  {(i.file.size / 1048576).toFixed(1)} MB
                </span>
                {i.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-neon-cyan" />}
                {i.status === 'done' && <CheckCircle2 className="h-4 w-4 text-neon-cyan" />}
                {i.status === 'error' && (
                  <span title={i.error} className="flex items-center gap-1 text-xs text-neon-pink">
                    <AlertCircle className="h-4 w-4" /> Failed
                  </span>
                )}
                {i.status === 'ready' && (
                  <button type="button" className="icon-btn h-7 w-7" aria-label="Remove file" onClick={() => setItems((c) => c.filter((x) => x.key !== i.key))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {items.some((i) => i.status === 'error') && (
          <p className="text-xs text-neon-pink">
            {items.find((i) => i.status === 'error')?.error}. Press Upload again to retry the failed files.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="upload-tags" className="label mb-2 block">Tags for this batch</label>
            <input id="upload-tags" className="field" placeholder="Demo, R&B, 2026" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div>
            <label htmlFor="upload-release" className="label mb-2 block">Release date</label>
            <input id="upload-release" type="date" className="field" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Edit details                                                        */
/* ------------------------------------------------------------------ */
function EditModal({ track, onClose, onSaved }) {
  const [title, setTitle] = useState(track.title || '');
  const [artist, setArtist] = useState(track.artist || '');
  const [tags, setTags] = useState((track.tags || []).join(', '));
  const [releaseDate, setReleaseDate] = useState(track.release_date ? String(track.release_date).slice(0, 10) : '');
  const [lyrics, setLyrics] = useState(track.lyrics || '');
  const [artFile, setArtFile] = useState(null);
  const [artPreview, setArtPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const artRef = useRef(null);

  useEffect(() => () => artPreview && URL.revokeObjectURL(artPreview), [artPreview]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      let { track: saved } = await api.updateTrack(track.id, {
        title: title.trim() || 'Untitled',
        artist: artist.trim() || 'Dré Smoove',
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        release_date: releaseDate || null,
        lyrics: lyrics.trim() ? lyrics : null,
      });
      if (artFile) ({ track: saved } = await api.uploadArtwork(track.id, artFile));
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const previewTrack = artPreview ? { ...track, artwork_url: artPreview } : track;

  return (
    <Modal
      title="Edit track details"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save changes
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <TrackArt track={previewTrack} size={96} rounded="rounded-xl" />
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-ghost" onClick={() => artRef.current?.click()}>
              <ImagePlus className="h-4 w-4" /> {track.artwork_url || artPreview ? 'Replace artwork' : 'Add artwork'}
            </button>
            <span className="text-xs text-ink-500">Square JPG or PNG, 1400px or larger looks best.</span>
            <input
              ref={artRef}
              id="edit-artwork"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setArtFile(f);
                setArtPreview(URL.createObjectURL(f));
              }}
            />
          </div>
        </div>
        <div>
          <label htmlFor="edit-title" className="label mb-2 block">Title</label>
          <input id="edit-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-artist" className="label mb-2 block">Artist</label>
            <input id="edit-artist" className="field" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div>
            <label htmlFor="edit-release" className="label mb-2 block">Release date</label>
            <input id="edit-release" type="date" className="field" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="edit-tags" className="label mb-2 block">Tags (comma separated)</label>
          <input id="edit-tags" className="field" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <div>
          <label htmlFor="edit-lyrics" className="label mb-2 block">Lyrics</label>
          <textarea
            id="edit-lyrics"
            rows={10}
            className="field resize-y font-sans leading-relaxed"
            placeholder={'Paste or type the lyrics here.\n\n[Verse]\n...\n\n[Chorus]\n...'}
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
          />
        </div>
        {track.source === 'ai' && track.prompt && (
          <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
            <div className="label mb-1">Original prompt</div>
            <p className="text-sm text-ink-300">{track.prompt}</p>
          </div>
        )}
        {error && <p className="text-sm text-neon-pink">{error}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Lyrics viewer                                                       */
/* ------------------------------------------------------------------ */
export function LyricsModal({ track, onClose, onEdit }) {
  return (
    <Modal
      title={track.title}
      onClose={onClose}
      footer={
        <>
          {onEdit && (
            <button type="button" className="btn-ghost" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> {track.lyrics ? 'Edit lyrics' : 'Add lyrics'}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </>
      }
    >
      {track.lyrics ? (
        <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-ink-100">{track.lyrics}</pre>
      ) : (
        <p className="text-sm text-ink-400">No lyrics saved for this song yet.</p>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Row menu                                                            */
/* ------------------------------------------------------------------ */
function RowMenu({ track, playlists, inPlaylist, onEdit, onLyrics, onAddTo, onRemoveFrom, onDelete }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('main');
  const [busy, setBusy] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const openMenu = () => {
    setView('main');
    setConfirmDelete(false);
    setOpen((o) => !o);
  };

  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-100 hover:bg-ink-700';

  const doDownload = async (fmt) => {
    setBusy(fmt);
    try {
      await downloadTrack(track, fmt);
      setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" className="icon-btn" aria-label={`More actions for ${track.title}`} aria-expanded={open} onClick={openMenu}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-60 rounded-xl border border-ink-700 bg-ink-850 p-1.5 shadow-2xl">
          {view === 'main' ? (
            <>
              <button type="button" className={item} onClick={() => { setOpen(false); onEdit(); }}>
                <Pencil className="h-4 w-4 text-ink-400" /> Edit details &amp; artwork
              </button>
              <button type="button" className={item} onClick={() => { setOpen(false); onLyrics(); }}>
                <FileText className="h-4 w-4 text-ink-400" /> {track.lyrics ? 'View lyrics' : 'Add lyrics'}
              </button>
              <button type="button" className={item} onClick={() => setView('playlists')}>
                <ListPlus className="h-4 w-4 text-ink-400" /> Add to playlist
              </button>
              {inPlaylist && (
                <button type="button" className={item} onClick={() => { setOpen(false); onRemoveFrom(); }}>
                  <X className="h-4 w-4 text-ink-400" /> Remove from this playlist
                </button>
              )}
              <div className="my-1 border-t border-ink-700" />
              <button type="button" className={item} onClick={() => doDownload('original')}>
                {busy === 'original' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileAudio className="h-4 w-4 text-neon-cyan" />}
                Download {(track.format || 'mp3').toUpperCase()}
              </button>
              {(track.format || 'mp3') !== 'wav' && (
                <button type="button" className={item} onClick={() => doDownload('wav')}>
                  {busy === 'wav' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileAudio className="h-4 w-4 text-neon-pink" />}
                  Download WAV
                </button>
              )}
              <div className="my-1 border-t border-ink-700" />
              {confirmDelete ? (
                <button type="button" className={`${item} !text-neon-pink`} onClick={() => { setOpen(false); onDelete(); }}>
                  <Trash2 className="h-4 w-4" /> Confirm: delete forever
                </button>
              ) : (
                <button type="button" className={`${item} text-ink-300`} onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Delete track
                </button>
              )}
            </>
          ) : (
            <>
              <div className="label px-3 py-1.5">Add to playlist</div>
              {playlists.length ? (
                playlists.map((p) => {
                  const has = p.track_ids.includes(track.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={item}
                      disabled={has}
                      onClick={() => { setOpen(false); onAddTo(p.id); }}
                    >
                      <ListMusic className="h-4 w-4 text-ink-400" />
                      <span className="flex-1 truncate">{p.name}</span>
                      {has && <Check className="h-4 w-4 text-neon-cyan" />}
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-2 text-xs text-ink-400">No playlists yet. Create one from the sidebar.</p>
              )}
              <button type="button" className={`${item} text-ink-400`} onClick={() => setView('main')}>Back</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Track row                                                           */
/* ------------------------------------------------------------------ */
function TrackRow({ track, index, list, ...menuProps }) {
  const { isCurrent, playing, playTrack, toggle } = usePlayer();
  const active = isCurrent(track.id);
  return (
    <li
      className={`group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-2 py-2 transition md:grid-cols-[2rem_minmax(0,2fr)_minmax(0,1.3fr)_7rem_3.5rem_2.25rem] md:px-3 ${
        active ? 'bg-ink-800/80 ring-1 ring-ink-700' : 'hover:bg-ink-850'
      }`}
    >
      <button
        type="button"
        onClick={() => (active ? toggle() : playTrack(track, list))}
        aria-label={active && playing ? `Pause ${track.title}` : `Play ${track.title}`}
        className="hidden h-8 w-8 items-center justify-center rounded-full text-ink-400 hover:bg-ink-700 hover:text-white md:flex"
      >
        {active && playing ? (
          <Pause className="h-4 w-4 text-neon-cyan" fill="currentColor" />
        ) : (
          <>
            <span className="font-mono text-xs tabular-nums group-hover:hidden">{active ? <Disc3 className="h-4 w-4 animate-spin text-neon-cyan" /> : index + 1}</span>
            <Play className="hidden h-4 w-4 group-hover:block" fill="currentColor" />
          </>
        )}
      </button>

      <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => (active ? toggle() : playTrack(track, list))}>
        <span className="relative">
          <TrackArt track={track} size={44} />
          <span className={`absolute inset-0 flex items-center justify-center rounded-lg bg-ink-950/55 text-white md:hidden ${active ? '' : 'opacity-0'}`}>
            {active && playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
          </span>
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-sm font-semibold ${active ? 'text-neon-cyan' : 'text-white'}`}>{track.title}</span>
          <span className="flex items-center gap-1.5 truncate text-xs text-ink-400">
            {track.source === 'ai' ? (
              <span className="inline-flex items-center gap-1 rounded bg-neon-violet/15 px-1.5 py-px font-mono text-[10px] text-neon-violet">
                <Bot className="h-3 w-3" /> AI
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-neon-cyan/10 px-1.5 py-px font-mono text-[10px] text-neon-cyan">REC</span>
            )}
            <span className="truncate">{track.artist || 'Dré Smoove'}</span>
          </span>
        </span>
      </button>

      <div className="hidden min-w-0 flex-wrap gap-1 md:flex">
        {(track.tags || []).slice(0, 3).map((t) => (
          <span key={t} className="chip border-ink-700 bg-ink-850 px-2 py-0.5 text-[11px] text-ink-300">{t}</span>
        ))}
        {(track.tags || []).length > 3 && <span className="text-[11px] text-ink-500">+{track.tags.length - 3}</span>}
      </div>

      <span className="hidden font-mono text-[11px] tabular-nums text-ink-400 md:block">{fmtDate(track.release_date)}</span>
      <span className="text-right font-mono text-[11px] tabular-nums text-ink-400">{formatTime(track.duration)}</span>
      <RowMenu track={track} {...menuProps} />
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Vault                                                               */
/* ------------------------------------------------------------------ */
export default function AudioVault() {
  const { playTrack, syncTrack, removeTrack } = usePlayer();
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [view, setView] = useState({ type: 'all' }); // all | upload | ai | playlist
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [sort, setSort] = useState('newest');

  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewingLyrics, setViewingLyrics] = useState(null);
  const [newPlaylist, setNewPlaylist] = useState(null);
  const [toast, setToast] = useState(null);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ tracks }, { playlists }] = await Promise.all([api.listTracks(), api.listPlaylists()]);
      setTracks(tracks);
      setPlaylists(playlists);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => Object.fromEntries(tracks.map((t) => [t.id, t])), [tracks]);
  const activePlaylist = view.type === 'playlist' ? playlists.find((p) => p.id === view.id) : null;

  const allTags = useMemo(() => {
    const counts = {};
    tracks.forEach((t) => (t.tags || []).forEach((g) => (counts[g] = (counts[g] || 0) + 1)));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g]) => g);
  }, [tracks]);

  const visible = useMemo(() => {
    let list;
    if (activePlaylist) list = activePlaylist.track_ids.map((id) => byId[id]).filter(Boolean);
    else if (view.type === 'upload' || view.type === 'ai') list = tracks.filter((t) => t.source === view.type);
    else list = tracks;

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        [t.title, t.artist, ...(t.tags || [])].filter(Boolean).some((s) => s.toLowerCase().includes(q))
      );
    }
    if (tagFilter) list = list.filter((t) => (t.tags || []).includes(tagFilter));

    if (!activePlaylist) {
      const sorted = [...list];
      if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
      else if (sort === 'release')
        sorted.sort((a, b) => String(b.release_date || '').localeCompare(String(a.release_date || '')));
      else sorted.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      list = sorted;
    }
    return list;
  }, [tracks, byId, activePlaylist, view.type, query, tagFilter, sort]);

  const totalSeconds = visible.reduce((s, t) => s + (Number(t.duration) || 0), 0);

  const collections = [
    { key: 'all', label: 'All tracks', icon: Disc3, count: tracks.length },
    { key: 'upload', label: 'Recordings', icon: AudioLines, count: tracks.filter((t) => t.source === 'upload').length },
    { key: 'ai', label: 'AI takes', icon: Bot, count: tracks.filter((t) => t.source === 'ai').length },
  ];

  const createPlaylist = async () => {
    const name = (newPlaylist || '').trim();
    if (!name) return setNewPlaylist(null);
    try {
      const { playlist } = await api.createPlaylist(name);
      setPlaylists((p) => [...p, playlist]);
      setView({ type: 'playlist', id: playlist.id });
      setNewPlaylist(null);
    } catch (e) {
      flash(e.message);
    }
  };

  const deletePlaylist = async (id) => {
    try {
      await api.deletePlaylist(id);
      setPlaylists((p) => p.filter((x) => x.id !== id));
      setView({ type: 'all' });
      flash('Playlist deleted');
    } catch (e) {
      flash(e.message);
    }
  };

  const addTo = async (playlistId, trackId) => {
    try {
      const { playlist } = await api.updatePlaylist(playlistId, { add: trackId });
      setPlaylists((ps) => ps.map((p) => (p.id === playlist.id ? playlist : p)));
      flash(`Added to ${playlist.name}`);
    } catch (e) {
      flash(e.message);
    }
  };

  const removeFrom = async (playlistId, trackId) => {
    try {
      const { playlist } = await api.updatePlaylist(playlistId, { remove: trackId });
      setPlaylists((ps) => ps.map((p) => (p.id === playlist.id ? playlist : p)));
    } catch (e) {
      flash(e.message);
    }
  };

  const deleteTrack = async (track) => {
    try {
      await api.deleteTrack(track.id);
      setTracks((ts) => ts.filter((t) => t.id !== track.id));
      setPlaylists((ps) => ps.map((p) => ({ ...p, track_ids: p.track_ids.filter((id) => id !== track.id) })));
      removeTrack(track.id);
      flash(`Deleted “${track.title}”`);
    } catch (e) {
      flash(e.message);
    }
  };

  const onSaved = (t) => {
    setTracks((ts) => ts.map((x) => (x.id === t.id ? t : x)));
    syncTrack(t);
    flash('Changes saved');
  };

  const heading = activePlaylist ? activePlaylist.name : collections.find((c) => c.key === view.type)?.label;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2">My Library &amp; Vault</div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">The Vault</h1>
          <p className="mt-1 font-mono text-xs text-ink-400">
            {tracks.length} tracks · {playlists.length} playlists
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => setNewPlaylist('')}>
            <ListPlus className="h-4 w-4" /> New playlist
          </button>
          <button type="button" className="btn-primary" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4" /> Upload
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* ------- Collections + playlists ------- */}
        <aside className="flex min-w-0 flex-col gap-5">
          <nav aria-label="Collections" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
            {collections.map(({ key, label, icon: Icon, count }) => {
              const on = view.type === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView({ type: key })}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition lg:w-full ${
                    on ? 'bg-ink-800 text-white ring-1 ring-ink-700' : 'text-ink-300 hover:bg-ink-900 hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${on ? 'text-neon-cyan' : 'text-ink-400'}`} />
                  <span className="lg:flex-1 lg:text-left">{label}</span>
                  <span className="font-mono text-[11px] text-ink-500">{count}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center justify-between px-1">
              <span className="label">Playlists</span>
              <button type="button" className="icon-btn h-7 w-7" aria-label="New playlist" onClick={() => setNewPlaylist('')}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {newPlaylist !== null && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createPlaylist();
                }}
                className="flex gap-1.5"
              >
                <input
                  id="new-playlist-name"
                  autoFocus
                  className="field py-2"
                  placeholder="Playlist name"
                  value={newPlaylist}
                  onChange={(e) => setNewPlaylist(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setNewPlaylist(null)}
                />
                <button type="submit" className="btn-primary px-3" aria-label="Create playlist">
                  <Check className="h-4 w-4" />
                </button>
              </form>
            )}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
              {playlists.map((p) => {
                const on = view.type === 'playlist' && view.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setView({ type: 'playlist', id: p.id })}
                    className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition lg:w-full ${
                      on ? 'bg-ink-800 text-white ring-1 ring-ink-700' : 'text-ink-300 hover:bg-ink-900 hover:text-white'
                    }`}
                  >
                    <ListMusic className={`h-4 w-4 ${on ? 'text-neon-pink' : 'text-ink-400'}`} />
                    <span className="max-w-[10rem] truncate lg:flex-1 lg:text-left">{p.name}</span>
                    <span className="font-mono text-[11px] text-ink-500">{p.track_ids.length}</span>
                  </button>
                );
              })}
              {!playlists.length && newPlaylist === null && (
                <p className="px-3 py-2 text-xs text-ink-500">No playlists yet.</p>
              )}
            </div>
          </div>
        </aside>

        {/* ------- Track list ------- */}
        <section className="panel min-w-0 p-3 sm:p-4" aria-label={heading}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-bold text-white">{heading}</h2>
              <p className="font-mono text-[11px] text-ink-400">
                {visible.length} {visible.length === 1 ? 'track' : 'tracks'} · {formatTime(totalSeconds)} total
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-ghost"
                disabled={!visible.length}
                onClick={() => visible[0] && playTrack(visible[0], visible)}
              >
                <Play className="h-4 w-4" fill="currentColor" /> Play all
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={visible.length < 2}
                onClick={() => {
                  const s = [...visible].sort(() => Math.random() - 0.5);
                  playTrack(s[0], s);
                }}
              >
                <Shuffle className="h-4 w-4" /> Shuffle
              </button>
              {activePlaylist && (
                <button type="button" className="btn text-ink-400 hover:text-neon-pink" onClick={() => deletePlaylist(activePlaylist.id)}>
                  <Trash2 className="h-4 w-4" /> Delete playlist
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-y border-ink-800 px-1 py-3">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input
                id="vault-search"
                type="search"
                className="field py-2 pl-9"
                placeholder="Search titles, artists, tags"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {!activePlaylist && (
              <label className="relative flex items-center">
                <ArrowDownUp className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-ink-400" />
                <select
                  id="vault-sort"
                  aria-label="Sort tracks"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="field appearance-none py-2 pl-8 pr-8"
                >
                  <option value="newest">Newest added</option>
                  <option value="release">Release date</option>
                  <option value="title">Title A–Z</option>
                </select>
              </label>
            )}
          </div>

          {allTags.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto px-1 py-3">
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
                  aria-pressed={tagFilter === t}
                  className={`chip shrink-0 ${
                    tagFilter === t
                      ? 'border-neon-pink/60 bg-neon-pink/10 text-neon-pink'
                      : 'border-ink-700 bg-ink-850 text-ink-300 hover:text-white'
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          <div className="hidden grid-cols-[2rem_minmax(0,2fr)_minmax(0,1.3fr)_7rem_3.5rem_2.25rem] gap-3 px-3 pb-2 pt-1 md:grid">
            <span className="label">#</span>
            <span className="label">Title</span>
            <span className="label">Tags</span>
            <span className="label flex items-center gap-1"><Calendar className="h-3 w-3" /> Release</span>
            <span className="label text-right">Time</span>
            <span />
          </div>

          {error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <AlertCircle className="h-6 w-6 text-neon-pink" />
              <p className="max-w-md text-sm text-ink-300">{error}</p>
              <button type="button" className="btn-ghost" onClick={load}>Try again</button>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 px-3 py-10 text-sm text-ink-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Opening the vault
            </div>
          ) : visible.length ? (
            <ul className="flex flex-col gap-0.5">
              {visible.map((t, i) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  index={i}
                  list={visible}
                  playlists={playlists}
                  inPlaylist={!!activePlaylist}
                  onEdit={() => setEditing(t)}
                  onLyrics={() => (t.lyrics ? setViewingLyrics(t) : setEditing(t))}
                  onAddTo={(pid) => addTo(pid, t.id)}
                  onRemoveFrom={() => activePlaylist && removeFrom(activePlaylist.id, t.id)}
                  onDelete={() => deleteTrack(t)}
                />
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800 text-ink-300">
                <ListMusic className="h-6 w-6" />
              </div>
              <p className="max-w-sm text-sm text-ink-400">
                {query || tagFilter
                  ? 'Nothing matches that search.'
                  : activePlaylist
                    ? 'This playlist is empty. Use the ••• menu on any track and choose Add to playlist.'
                    : 'Upload your first recording to start the vault.'}
              </p>
              {!activePlaylist && !query && !tagFilter && (
                <button type="button" className="btn-primary" onClick={() => setShowUpload(true)}>
                  <Upload className="h-4 w-4" /> Upload recordings
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={(t) => setTracks((ts) => [t, ...ts])}
        />
      )}
      {editing && <EditModal track={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
      {viewingLyrics && (
        <LyricsModal
          track={tracks.find((x) => x.id === viewingLyrics.id) || viewingLyrics}
          onClose={() => setViewingLyrics(null)}
          onEdit={() => {
            setEditing(tracks.find((x) => x.id === viewingLyrics.id) || viewingLyrics);
            setViewingLyrics(null);
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed left-1/2 top-5 z-[70] -translate-x-1/2 rounded-full border border-ink-600 bg-ink-800 px-4 py-2 text-sm text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
