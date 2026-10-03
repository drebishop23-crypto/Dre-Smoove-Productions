'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Check, ExternalLink, Link2, Loader2, Unlink } from 'lucide-react';
import { api } from '@/lib/api';

const DIRECT = [
  {
    key: 'youtube',
    name: 'YouTube',
    does: 'Uploads your AI music videos straight to your channel.',
    keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  {
    key: 'soundcloud',
    name: 'SoundCloud',
    does: 'Uploads the full-quality song with cover art and description.',
    keys: ['SOUNDCLOUD_CLIENT_ID', 'SOUNDCLOUD_CLIENT_SECRET'],
    note: 'SoundCloud only gives these keys to Artist Pro accounts. Everything is built and switches on when the keys are added.',
  },
];

const VIA_DISTROKID = [
  { name: 'DistroKid', does: 'Use Release & share on any song to download its release kit, then upload it on DistroKid.', href: 'https://distrokid.com/new/' },
  { name: 'Spotify', does: 'Delivered by DistroKid. Paste the Spotify link on the song once it is live.', href: 'https://artists.spotify.com/' },
  { name: 'Apple Music', does: 'Delivered by DistroKid. Paste the Apple Music link on the song once it is live.', href: 'https://artists.apple.com/' },
];

export default function Connections() {
  const params = useSearchParams();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    api
      .connections()
      .then((r) => setStatus(r.connections))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const flashConnected = params.get('connected');
  const flashError = params.get('error');

  const disconnect = async (key) => {
    setBusy(key);
    try {
      await api.disconnect(key);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <div className="label mb-2">Connections</div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Send your music everywhere</h1>
      </header>

      {flashConnected && (
        <p className="flex items-center gap-2 rounded-xl border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-3 text-sm text-neon-cyan">
          <Check className="h-4 w-4" /> {flashConnected === 'youtube' ? 'YouTube' : 'SoundCloud'} is connected.
        </p>
      )}
      {(flashError || error) && (
        <p className="flex items-center gap-2 rounded-xl border border-neon-pink/40 bg-neon-pink/10 px-4 py-3 text-sm text-neon-pink">
          <AlertCircle className="h-4 w-4" />
          {flashError?.endsWith('-not-configured')
            ? 'That platform needs its keys added in Netlify first. The card below shows which ones.'
            : flashError || error}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {DIRECT.map((p) => {
          const s = status?.[p.key];
          return (
            <div key={p.key} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-white">{p.name}</h2>
                {!status ? (
                  <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
                ) : s?.connected ? (
                  <span className="chip border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan"><Check className="h-3 w-3" /> Connected</span>
                ) : s?.configured ? (
                  <span className="chip border-ink-600 bg-ink-800 text-ink-300">Ready to connect</span>
                ) : (
                  <span className="chip border-neon-amber/40 bg-neon-amber/10 text-neon-amber">Needs keys</span>
                )}
              </div>
              <p className="text-sm text-ink-300">{p.does}</p>
              {s?.account && <p className="text-sm text-ink-200">Account: <span className="font-semibold text-gold">{s.account}</span></p>}
              {p.note && !s?.configured && <p className="text-xs text-ink-500">{p.note}</p>}
              {s && !s.configured && (
                <p className="text-xs text-ink-500">
                  Waiting on {p.keys.join(' and ')} in Netlify's environment variables.
                </p>
              )}
              <div className="mt-auto flex gap-2 pt-2">
                {s?.connected ? (
                  <button type="button" className="btn-ghost" onClick={() => disconnect(p.key)} disabled={busy === p.key}>
                    {busy === p.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />} Disconnect
                  </button>
                ) : (
                  <a
                    href={`/api/connect/${p.key}/start`}
                    className={`btn-primary ${s?.configured ? '' : 'pointer-events-none opacity-50'}`}
                    aria-disabled={!s?.configured}
                  >
                    <Link2 className="h-4 w-4" /> Connect {p.name}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-lg font-bold text-white">DistroKid, Spotify and Apple Music</h2>
        <p className="mt-1 text-sm text-ink-400">
          Spotify and Apple Music don't let any app upload directly; every artist goes through a distributor. Your app prepares the release kit and keeps the store links.
        </p>
        <ul className="mt-4 flex flex-col divide-y divide-ink-800">
          {VIA_DISTROKID.map((p) => (
            <li key={p.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-white">{p.name}</div>
                <div className="text-sm text-ink-400">{p.does}</div>
              </div>
              <a href={p.href} target="_blank" rel="noreferrer" className="btn-ghost">
                Open <ExternalLink className="h-4 w-4" />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
