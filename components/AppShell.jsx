'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AudioWaveform, Library, Link2, SlidersHorizontal, Sparkles, UserRound } from 'lucide-react';
import { PlayerProvider, usePlayer } from '@/components/PlayerProvider';
import PlayerBar from '@/components/PlayerBar';
import TrackArt from '@/components/TrackArt';

const NAV = [
  { href: '/profile', label: 'Profile', short: 'Profile', icon: UserRound, hint: 'Your artist page' },
  { href: '/create', label: 'Create', short: 'Create', icon: Sparkles, hint: 'Make songs, covers, remixes' },
  { href: '/studio', label: 'Studio', short: 'Studio', icon: SlidersHorizontal, hint: 'Multitrack editing' },
  { href: '/library', label: 'Library', short: 'Library', icon: Library, hint: 'Songs, playlists, hooks' },
  { href: '/connections', label: 'Connections', short: 'Connect', icon: Link2, hint: 'YouTube, SoundCloud, DistroKid' },
];

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-850 ring-1 ring-ink-700">
        <AudioWaveform className="h-5 w-5 text-neon-cyan" />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-neon-pink shadow-pinkglow" />
      </div>
      <div className="leading-tight text-gold">
        <div className="font-display text-[15px] font-bold tracking-tight">Dré “Smoove”</div>
        <div
          className={`font-display font-bold uppercase tracking-[0.18em] ${
            compact ? 'text-[10px]' : 'text-[11px]'
          }`}
        >
          Productions
        </div>
      </div>
    </div>
  );
}

function NowPlayingMini() {
  const { current, playing } = usePlayer();
  if (!current) {
    return (
      <div className="rounded-xl border border-dashed border-ink-700 p-3 text-xs leading-relaxed text-ink-400">
        Nothing playing. Hit play on any track and it keeps going while you move around.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-2.5">
      <TrackArt track={current} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{current.title}</div>
        <div className="flex items-center gap-1.5 text-xs text-ink-400">
          {playing ? (
            <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-[3px] origin-bottom animate-pulsebar rounded-sm bg-neon-cyan"
                  style={{ height: 12, animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          ) : null}
          <span className="truncate">{playing ? 'Playing' : 'Paused'}</span>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }) {
  const pathname = usePathname() || '/create';
  const { current } = usePlayer();

  return (
    <div className="flex h-full min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-8 border-r border-ink-800 bg-ink-950/70 px-4 py-6 backdrop-blur md:flex">
        <Brand />
        <nav className="flex flex-col gap-1" aria-label="Main">
          <div className="label mb-2 px-3">Workspace</div>
          {NAV.map(({ href, label, icon: Icon, hint }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                  active ? 'bg-ink-800 text-white ring-1 ring-ink-700' : 'text-ink-300 hover:bg-ink-900 hover:text-white'
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    active ? 'bg-neon-cyan/15 text-neon-cyan' : 'bg-ink-850 text-ink-400 group-hover:text-ink-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block truncate text-[11px] text-ink-400">{hint}</span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <div className="label px-1">Now playing</div>
          <NowPlayingMini />
          <p className="px-1 text-[11px] text-ink-500">Private studio · personal use only</p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-800 bg-ink-950/85 px-4 py-3 backdrop-blur md:hidden">
          <Brand compact />
        </header>
        <main className={`min-w-0 flex-1 px-4 pt-5 md:px-8 md:pt-8 ${current ? 'pb-44 md:pb-32' : 'pb-24 md:pb-10'}`}>
          {children}
        </main>
      </div>

      <PlayerBar />

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ink-800 bg-ink-950/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {NAV.map(({ href, short, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${
                active ? 'text-neon-cyan' : 'text-ink-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              {short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function AppShell({ children }) {
  return (
    <PlayerProvider>
      <Shell>{children}</Shell>
    </PlayerProvider>
  );
}
