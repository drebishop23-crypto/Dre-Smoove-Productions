'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Clapperboard, Download, ExternalLink, Loader2, Package, Upload } from 'lucide-react';
import Modal from '@/components/Modal';
import TrackArt from '@/components/TrackArt';
import { api } from '@/lib/api';
import { buildReleaseKit, uploadToSoundCloud, uploadToYouTube } from '@/lib/platforms';

function Section({ title, badge, children }) {
  return (
    <section className="rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-bold text-white">{title}</h3>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Status({ ok, children }) {
  return (
    <span className={`chip ${ok ? 'border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan' : 'border-ink-600 bg-ink-800 text-ink-300'}`}>
      {children}
    </span>
  );
}

function Progress({ value, label }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs text-ink-400">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full bg-gradient-to-r from-neon-cyan to-gold" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

// One place to send a song out: YouTube, SoundCloud, and the DistroKid release kit
// (DistroKid then delivers to Spotify, Apple Music and the other stores).
export default function ReleaseModal({ track, onClose, onSaved }) {
  const [conn, setConn] = useState(null);
  const [title, setTitle] = useState(track.title);
  const [description, setDescription] = useState(
    `${track.title} by ${track.artist || 'Dré Smoove'}\n\nDré "Smoove" Productions${track.lyrics ? `\n\nLyrics:\n${track.lyrics}` : ''}`
  );
  const [ytPrivacy, setYtPrivacy] = useState('private');
  const [scSharing, setScSharing] = useState('private');
  const [job, setJob] = useState(null); // { platform, progress, label }
  const [done, setDone] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    api.connections().then((r) => setConn(r.connections)).catch(() => setConn({}));
  }, []);

  const refresh = async () => {
    const { tracks } = await api.listTracks();
    const t = tracks.find((x) => x.id === track.id);
    if (t) onSaved?.(t);
  };

  const run = async (platform, fn) => {
    setError(null);
    setJob({ platform, progress: 0, label: 'Starting' });
    try {
      const url = await fn((p, label) => setJob({ platform, progress: p || 0, label: label || 'Working' }));
      setDone((d) => ({ ...d, [platform]: url || true }));
      await refresh().catch(() => {});
    } catch (e) {
      setError(`${platform}: ${e.message}`);
    } finally {
      setJob(null);
    }
  };

  const busy = Boolean(job);
  const yt = conn?.youtube;
  const sc = conn?.soundcloud;

  return (
    <Modal title="Release & share" onClose={busy ? () => {} : onClose} wide footer={<button type="button" className="btn-primary" onClick={onClose} disabled={busy}>Done</button>}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <TrackArt track={track} size={56} />
          <div className="min-w-0 flex-1">
            <label htmlFor="rel-title" className="label mb-1 block">Title on every platform</label>
            <input id="rel-title" className="field py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="rel-desc" className="label mb-1 block">Description</label>
          <textarea id="rel-desc" rows={4} className="field resize-y text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {/* YouTube */}
        <Section
          title="YouTube"
          badge={<Status ok={yt?.connected}>{yt?.connected ? `Connected${yt.account ? ` · ${yt.account}` : ''}` : 'Not connected'}</Status>}
        >
          {!track.video_url ? (
            <p className="text-sm text-ink-300">
              YouTube needs a video. Make the AI music video first, then come back here.{' '}
              <Link href={`/video/${track.id}`} className="inline-flex items-center gap-1 font-semibold text-gold hover:underline">
                <Clapperboard className="h-4 w-4" /> Make music video
              </Link>
            </p>
          ) : !yt?.connected ? (
            <p className="text-sm text-ink-300">
              Connect your channel on the <Link href="/connections" className="font-semibold text-gold hover:underline">Connections</Link> page first.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select id="rel-yt-privacy" aria-label="YouTube visibility" className="field w-auto py-2" value={ytPrivacy} onChange={(e) => setYtPrivacy(e.target.value)}>
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => run('YouTube', (p) => uploadToYouTube({ track, title, description, privacy: ytPrivacy, onProgress: p }))}
              >
                <Upload className="h-4 w-4" /> Upload video
              </button>
            </div>
          )}
          {job?.platform === 'YouTube' && <Progress value={job.progress} label={job.label} />}
          {done.YouTube && (
            <a href={done.YouTube} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-neon-cyan">
              <Check className="h-4 w-4" /> Uploaded. Open on YouTube <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </Section>

        {/* SoundCloud */}
        <Section
          title="SoundCloud"
          badge={<Status ok={sc?.connected}>{sc?.connected ? `Connected${sc.account ? ` · ${sc.account}` : ''}` : 'Not connected'}</Status>}
        >
          {!sc?.connected ? (
            <p className="text-sm text-ink-300">
              Connect SoundCloud on the <Link href="/connections" className="font-semibold text-gold hover:underline">Connections</Link> page first.
              It uploads the full-quality {String(track.format || 'wav').toUpperCase()} with your cover art.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select id="rel-sc-sharing" aria-label="SoundCloud visibility" className="field w-auto py-2" value={scSharing} onChange={(e) => setScSharing(e.target.value)}>
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => run('SoundCloud', (p) => uploadToSoundCloud({ track, title, description, sharing: scSharing, onProgress: p }))}
              >
                <Upload className="h-4 w-4" /> Upload song
              </button>
            </div>
          )}
          {job?.platform === 'SoundCloud' && <Progress value={job.progress} label={job.label} />}
          {done.SoundCloud && (
            <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-neon-cyan">
              <Check className="h-4 w-4" /> Uploaded to SoundCloud
              {typeof done.SoundCloud === 'string' && (
                <a href={done.SoundCloud} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 underline">
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </p>
          )}
        </Section>

        {/* DistroKid → Spotify, Apple Music */}
        <Section title="DistroKid · Spotify · Apple Music" badge={<Status ok>Release kit</Status>}>
          <p className="text-sm text-ink-300">
            Spotify and Apple Music only accept music through a distributor. The release kit packs everything DistroKid asks for: the {String(track.format || 'wav').toUpperCase()}, the cover sized to 3000 × 3000, the lyrics, and the song details.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => run('Release kit', async (p) => {
                await buildReleaseKit(track, { onProgress: (label) => p(0.5, label) });
                return true;
              })}
            >
              <Package className="h-4 w-4" /> Download release kit
            </button>
            <a href="https://distrokid.com/new/" target="_blank" rel="noreferrer" className="btn-ghost">
              Open DistroKid upload <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          {!track.artwork_url && (
            <p className="mt-2 text-xs text-neon-amber">This song has no cover yet. Add one in Edit details first, because DistroKid requires it.</p>
          )}
          {job?.platform === 'Release kit' && <p className="mt-3 flex items-center gap-2 text-sm text-ink-300"><Loader2 className="h-4 w-4 animate-spin" /> {job.label}</p>}
          {done['Release kit'] && (
            <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-neon-cyan">
              <Download className="h-4 w-4" /> Release kit downloaded
            </p>
          )}
          <p className="mt-3 text-xs text-ink-500">
            Once DistroKid delivers the song, paste its Spotify and Apple Music links in Edit details. They'll show on your profile.
          </p>
        </Section>

        {error && <p className="text-sm text-neon-pink">{error}</p>}
      </div>
    </Modal>
  );
}
