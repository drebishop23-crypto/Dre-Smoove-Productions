'use client';
import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AudioLines,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileAudio,
  ImagePlus,
  Loader2,
  Music2,
  Pencil,
  Scissors,
  Share2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import Modal from '@/components/Modal';
import TrackArt from '@/components/TrackArt';
import CoverGenerator from '@/components/CoverGenerator';
import SyncedLyrics from '@/components/SyncedLyrics';
import LyricSync from '@/components/LyricSync';
import { decodeFromFile, decodeFromUrl, downloadBlob, encodeWav, formatTime, peaksFromBuffer, safeFilename } from '@/lib/audio';
import { fileDate } from '@/lib/sorts';

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.aif,.aiff';

function titleFromFile(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function songLink(track) {
  if (typeof window === 'undefined') return `/song/${track.id}`;
  return `${window.location.origin}/song/${track.id}`;
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */
export function UploadModal({ onClose, onUploaded }) {
  const [items, setItems] = useState([]);
  const [tags, setTags] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [toWav, setToWav] = useState(false);
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (fileList) => {
    const files = [...fileList].filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|aiff?)$/i.test(f.name));
    setItems((cur) => [
      ...cur,
      ...files.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, title: titleFromFile(file.name), recorded: fileDate(file), status: 'ready' })),
    ]);
  };

  const update = (key, patch) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  // Length from the file's header: instant, even for a big WAV (no full decode)
  const readDuration = (file) =>
    new Promise((resolve) => {
      const a = new Audio();
      const url = URL.createObjectURL(file);
      const done = (d) => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(d) ? Math.round(d * 10) / 10 : null);
      };
      a.preload = 'metadata';
      a.onloadedmetadata = () => done(a.duration);
      a.onerror = () => done(null);
      a.src = url;
    });

  const start = async () => {
    setRunning(true);
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const queue = items.filter((i) => i.status !== 'done');
    // Two uploads at a time
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        update(item.key, { status: 'uploading', error: null, progress: 0 });
        try {
          let file = item.file;
          // Optional: turn MP3/M4A/etc. into WAV in the browser before uploading
          if (toWav && !/\.wav$/i.test(file.name)) {
            update(item.key, { converting: true });
            const buf = await decodeFromFile(file);
            file = new File([encodeWav(buf)], file.name.replace(/\.[^.]+$/, '') + '.wav', { type: 'audio/wav' });
            update(item.key, { converting: false });
          }
          const duration = await readDuration(file);
          const { track } = await api.uploadTrack(
            file,
            { title: item.title || titleFromFile(item.file.name), tags: tagList, release_date: releaseDate || null, recorded_date: item.recorded || null, duration },
            (p) => update(item.key, { progress: p })
          );
          update(item.key, { status: 'done' });
          onUploaded(track);
        } catch (e) {
          update(item.key, { status: 'error', error: e.message });
        }
      }
    };
    await Promise.all([worker(), worker()]);
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
                <input
                  type="date"
                  aria-label="Date recorded"
                  title="Date recorded"
                  className="w-[8.5rem] shrink-0 rounded-lg border border-ink-700 bg-ink-900 px-2 py-1 font-mono text-[11px] text-ink-200"
                  value={i.recorded || ''}
                  disabled={i.status !== 'ready' && i.status !== 'error'}
                  onChange={(e) => update(i.key, { recorded: e.target.value })}
                />
                <span className="hidden font-mono text-[11px] text-ink-500 sm:inline">
                  {(i.file.size / 1048576).toFixed(1)} MB
                </span>
                {i.status === 'uploading' && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-neon-cyan">
                    <Loader2 className="h-4 w-4 animate-spin" /> {Math.round((i.progress || 0) * 100)}%
                  </span>
                )}
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
        {items.length > 0 && (
          <p className="-mt-2 text-xs text-ink-500">The date next to each song is when it was recorded. It starts as the file's date; change it if you know the real one.</p>
        )}
        {items.some((i) => i.status === 'error') && (
          <p className="text-xs text-neon-pink">
            {items.find((i) => i.status === 'error')?.error}. Press Upload again to retry the failed files.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm text-ink-200">
          <input type="checkbox" checked={toWav} onChange={(e) => setToWav(e.target.checked)} className="h-4 w-4 accent-[#e8b94a]" disabled={running} />
          Convert MP3s and other files to WAV when uploading
        </label>

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
export function EditModal({ track, onClose, onSaved }) {
  const [title, setTitle] = useState(track.title || '');
  const [artist, setArtist] = useState(track.artist || '');
  const [tags, setTags] = useState((track.tags || []).join(', '));
  const [releaseDate, setReleaseDate] = useState(track.release_date ? String(track.release_date).slice(0, 10) : '');
  const [recordedDate, setRecordedDate] = useState(track.recorded_date ? String(track.recorded_date).slice(0, 10) : '');
  const [lyrics, setLyrics] = useState(track.lyrics || '');
  const [links, setLinks] = useState({
    spotify_url: track.spotify_url || '',
    apple_music_url: track.apple_music_url || '',
    soundcloud_url: track.soundcloud_url || '',
    youtube_url: track.youtube_url || '',
  });
  const [current, setCurrent] = useState(track);
  const [showCoverAI, setShowCoverAI] = useState(false);
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
        ...(recordedDate !== (track.recorded_date ? String(track.recorded_date).slice(0, 10) : '') ? { recorded_date: recordedDate || null } : {}),
        lyrics: lyrics.trim() ? lyrics : null,
        ...links,
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

  const previewTrack = artPreview ? { ...current, artwork_url: artPreview } : current;

  return (
    <Modal
      title="Song details"
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
              <ImagePlus className="h-4 w-4" /> {current.artwork_url || artPreview ? 'Upload new artwork' : 'Upload artwork'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowCoverAI(true)}>
              <Sparkles className="h-4 w-4 text-gold" /> Generate with AI
            </button>
            <span className="text-xs text-ink-500">Square JPG or PNG, 3000px is ideal for Spotify and Apple Music.</span>
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
        <SongFacts track={current} />
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
          <div>
            <label htmlFor="edit-recorded" className="label mb-2 block">Date recorded</label>
            <input id="edit-recorded" type="date" className="field" value={recordedDate} onChange={(e) => setRecordedDate(e.target.value)} />
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
        <div>
          <div className="label mb-2">Where it's released</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['spotify_url', 'Spotify link'],
              ['apple_music_url', 'Apple Music link'],
              ['soundcloud_url', 'SoundCloud link'],
              ['youtube_url', 'YouTube link'],
            ].map(([k, label]) => (
              <input
                key={k}
                id={`edit-${k}`}
                aria-label={label}
                className="field"
                placeholder={label}
                value={links[k]}
                onChange={(e) => setLinks((l) => ({ ...l, [k]: e.target.value }))}
              />
            ))}
          </div>
        </div>
        {track.source === 'ai' && track.prompt && (
          <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
            <div className="label mb-1">Original prompt</div>
            <p className="text-sm text-ink-300">{track.prompt}</p>
          </div>
        )}
        {error && <p className="text-sm text-neon-pink">{error}</p>}
      </div>
      {showCoverAI && (
        <CoverGenerator
          target="track"
          trackId={track.id}
          initialPrompt={[title, (tags || '').split(',')[0], (lyrics || '').split('\n').find((l) => l.trim() && !l.trim().startsWith('['))]
            .filter(Boolean)
            .join(', ')}
          onClose={() => setShowCoverAI(false)}
          onSaved={(res) => {
            if (res.track) {
              setCurrent(res.track);
              setArtFile(null);
              setArtPreview(null);
              onSaved(res.track, { keepOpen: true });
            }
          }}
        />
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Lyrics viewer                                                       */
/* ------------------------------------------------------------------ */
export function LyricsModal({ track, onClose, onEdit, onSaved }) {
  const [syncing, setSyncing] = useState(false);
  return (
    <Modal
      title={track.title}
      onClose={onClose}
      wide
      footer={
        <>
          {onEdit && (
            <button type="button" className="btn-ghost" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> {track.lyrics ? 'Edit lyrics' : 'Add lyrics'}
            </button>
          )}
          {track.lyrics && (
            <button type="button" className="btn-ghost" onClick={() => setSyncing(true)}>
              <AudioLines className="h-4 w-4 text-gold" /> {track.lyrics_synced?.length ? 'Re-sync to music' : 'Sync to music'}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </>
      }
    >
      {track.lyrics_synced?.length ? (
        <SyncedLyrics track={track} className="h-[55vh]" />
      ) : track.lyrics ? (
        <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-ink-100">{track.lyrics}</pre>
      ) : (
        <p className="text-sm text-ink-400">No lyrics saved for this song yet.</p>
      )}
      {syncing && <LyricSync track={track} onClose={() => setSyncing(false)} onSaved={onSaved} />}
    </Modal>
  );
}


/* ------------------------------------------------------------------ */
/* Details extras shown under Song details                             */
/* ------------------------------------------------------------------ */
export function SongFacts({ track }) {
  const rows = [
    ['Created', track.created_at ? new Date(track.created_at).toLocaleString() : '—'],
    ['Length', formatTime(track.duration)],
    ['Made with', track.source === 'ai' ? track.model || 'AI' : track.source === 'edit' ? 'Song Editor' : track.source === 'studio' ? 'Studio' : 'Uploaded recording'],
    ['Version', track.edit_note ? track.edit_note.replace(/^./, (c) => c.toUpperCase()) : 'Original'],
    ['Plays', String(track.plays || 0)],
    ['Visibility', track.is_public ? 'Public' : 'Private'],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-ink-700 bg-ink-850 p-3 text-sm sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] text-ink-500">{k}</dt>
          <dd className="truncate text-ink-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* Share                                                               */
/* ------------------------------------------------------------------ */
export function ShareModal({ track, onClose, onPublish, collab = false }) {
  const link = songLink(track);
  const [copied, setCopied] = useState(null);
  const message = collab
    ? `I'm looking for a collaborator on "${track.title}". Have a listen and tell me what you'd add: ${link}`
    : `Check out "${track.title}" by ${track.artist || 'Dré Smoove'}: ${link}`;
  const copy = async (text, which) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };
  return (
    <Modal title={collab ? 'Find a collaborator' : 'Share song'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <TrackArt track={track} size={56} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-white">{track.title}</div>
            <div className="text-xs text-ink-400">{track.is_public ? 'Public: anyone with the link can listen' : 'Private: publish it so the link works for others'}</div>
          </div>
        </div>
        {!track.is_public && (
          <button type="button" className="btn-primary w-fit" onClick={onPublish}>
            <Share2 className="h-4 w-4" /> Publish so others can open it
          </button>
        )}
        <div>
          <div className="label mb-2">Song link</div>
          <div className="flex gap-2">
            <input readOnly className="field font-mono text-xs" value={link} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-ghost shrink-0" onClick={() => copy(link, 'link')}>
              {copied === 'link' ? <Check className="h-4 w-4 text-neon-cyan" /> : <Copy className="h-4 w-4" />} Copy
            </button>
          </div>
        </div>
        <div>
          <div className="label mb-2">{collab ? 'Message to send' : 'Post text'}</div>
          <textarea readOnly rows={3} className="field text-sm" value={message} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => copy(message, 'msg')}>
              {copied === 'msg' ? <Check className="h-4 w-4 text-neon-cyan" /> : <Copy className="h-4 w-4" />} Copy message
            </button>
            {typeof navigator !== 'undefined' && navigator.share && (
              <button type="button" className="btn-ghost" onClick={() => navigator.share({ title: track.title, text: message, url: link }).catch(() => {})}>
                <Share2 className="h-4 w-4" /> Send with…
              </button>
            )}
          </div>
        </div>
        {collab && (
          <p className="text-xs text-ink-500">
            Anyone you send it to can listen and leave a comment on the song page. When Smoove Music Group opens to subscribers, collaborators will be able to join from there.
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Stems & MIDI                                                        */
/* ------------------------------------------------------------------ */
const STEM_LABELS = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Instruments', guitar: 'Guitar', piano: 'Piano' };

export function StemsModal({ track, onClose, onSaved }) {
  const [current, setCurrent] = useState(track);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const stems = current.stems_urls || {};

  const run = async (kind, extra = {}) => {
    setBusy(kind);
    setError(null);
    setStatus(kind === 'stems' ? 'Sending the song to the AI' : 'Reading the notes');
    try {
      const res = await api.runJob({ kind, track_id: current.id, ...extra }, setStatus, { every: 4000 });
      if (res.track) {
        setCurrent(res.track);
        onSaved?.(res.track);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
      setStatus('');
    }
  };

  const save = async (url, name) => {
    const res = await fetch(url);
    downloadBlob(await res.blob(), name);
  };

  return (
    <Modal title="Get stems & MIDI" onClose={onClose} wide>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink-300">
          Splits “{current.title}” into separate vocals, drums, bass and instruments you can download or drop into the Studio. Takes a couple of minutes and costs a few cents.
        </p>
        {Object.keys(stems).length ? (
          <ul className="flex flex-col gap-2">
            {Object.entries(stems).map(([k, url]) => (
              <li key={k} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5">
                <AudioLines className="h-4 w-4 text-gold" />
                <span className="w-28 font-semibold text-white">{STEM_LABELS[k] || k}</span>
                <audio controls preload="none" src={url} className="h-9 min-w-0 flex-1" />
                <button type="button" className="icon-btn" aria-label={`Download ${k}`} onClick={() => save(url, `${safeFilename(current.title)}-${k}.mp3`)}>
                  <Download className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" className="btn-primary w-fit" disabled={!!busy} onClick={() => run('stems')}>
            {busy === 'stems' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />} Split into stems
          </button>
        )}
        <div className="border-t border-ink-800 pt-4">
          <div className="label mb-2">MIDI</div>
          {current.midi_url ? (
            <button type="button" className="btn-ghost" onClick={() => save(current.midi_url, `${safeFilename(current.title)}.mid`)}>
              <Music2 className="h-4 w-4 text-gold" /> Download MIDI
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => run('midi', stems.other ? { stem: 'other' } : {})}>
                {busy === 'midi' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />} Make MIDI
              </button>
              <span className="text-xs text-ink-500">
                {stems.other ? 'Uses the instruments stem for cleaner notes.' : 'Tip: split stems first for cleaner MIDI.'}
              </span>
            </div>
          )}
        </div>
        {busy && <p className="flex items-center gap-2 text-sm text-gold"><Loader2 className="h-4 w-4 animate-spin" /> {status}</p>}
        {error && <p className="text-sm text-neon-pink">{error}</p>}
      </div>
    </Modal>
  );
}
