'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ArrowLeft,
  AudioLines,
  Check,
  ChevronRight,
  Clapperboard,
  Download,
  FastForward,
  FileText,
  FolderInput,
  Globe,
  Image as ImageIcon,
  Info,
  ListEnd,
  ListMusic,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Mic,
  Music2,
  Pencil,
  Pin,
  Plus,
  Repeat2,
  Replace,
  Scissors,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  SquareSplitHorizontal,
  Trash2,
  Undo2,
  UserPlus,
  Wand2,
  Waves,
  Layers,
  Gauge,
  TrendingDown,
  TrendingUp,
  Merge,
} from 'lucide-react';

function useIsDesktop() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (hover: hover)');
    const on = () => setD(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return d;
}

function MenuRow({ label, Icon, className, iconClass, onClick }) {
  return (
    <button type="button" role="menuitem" className={className} onClick={onClick}>
      <Icon className={iconClass} />
      <span className="flex-1">{label}</span>
    </button>
  );
}

function Toggle({ on }) {
  return (
    <span className={`ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${on ? 'bg-neon-pink' : 'bg-ink-600'}`}>
      <span className={`h-4 w-4 rounded-full bg-white transition ${on ? 'translate-x-4' : ''}`} />
    </span>
  );
}

// Suno-style song menu: Remix, Edit, Publish, Share, Download, Manage, Queue, Playlist.
export default function SongMenu({ track, actions, className = '', triggerClass = 'icon-btn' }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(null); // remix | edit | download | manage | workspace | playlist
  const [subTop, setSubTop] = useState(0);
  const [pos, setPos] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const subRef = useRef(null);
  const desktop = useIsDesktop();
  const a = actions;
  const t = track;

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = 248;
    const h = Math.min(window.innerHeight - 24, 520);
    const below = window.innerHeight - r.bottom;
    const top = below > h + 8 || below > r.top ? Math.min(r.bottom + 6, window.innerHeight - h - 12) : Math.max(12, r.top - h - 6);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w));
    setPos({ top: Math.max(12, top), left, maxH: h });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target) || subRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const run = (fn) => () => {
    setOpen(false);
    fn();
  };

  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink-100 hover:bg-ink-700 focus-visible:bg-ink-700 focus-visible:outline-none disabled:opacity-40';
  const icon = 'h-4 w-4 shrink-0 text-ink-300';

  const subItem = (key, label, Icon, extra) => (
    <button
      type="button"
      className={`${item} ${sub === key ? 'bg-ink-700' : ''}`}
      aria-haspopup="menu"
      aria-expanded={sub === key}
      onMouseEnter={(e) => {
        if (!desktop) return;
        setSub(key);
        setSubTop(e.currentTarget.getBoundingClientRect().top - 6);
      }}
      onClick={(e) => {
        setSub(key);
        setSubTop(e.currentTarget.getBoundingClientRect().top - 6);
      }}
    >
      <Icon className={icon} />
      <span className="flex-1">{label}</span>
      {extra}
      <ChevronRight className="h-4 w-4 text-ink-400" />
    </button>
  );

  const hoverClear = () => desktop && setSub(null);

  const lists = {
    remix: [
      ['Cover', Repeat2, () => a.remix('cover', t), 'New style, same melody'],
      ['Reuse Prompt', Undo2, () => a.remix('reuse', t)],
      ['Mashup', Merge, () => a.remix('mashup', t)],
      ['Sample this song', Waves, () => a.remix('sample', t)],
      ['Use as Inspiration', Sparkles, () => a.remix('inspiration', t)],
      ['Voice', Mic, () => a.remix('voice', t)],
    ],
    edit: [
      ['Extend', FastForward, () => a.edit('extend', t)],
      ['Crop', Scissors, () => a.edit('crop', t)],
      ['Remove Section', SquareSplitHorizontal, () => a.edit('remove', t)],
      ['Reverse', Undo2, () => a.edit('reverse', t)],
      ['Adjust Speed', Gauge, () => a.edit('speed', t)],
      ['Find a Collaborator', UserPlus, () => a.open('collab', t)],
      ['Fade In', TrendingUp, () => a.edit('fadein', t)],
      ['Fade Out', TrendingDown, () => a.edit('fadeout', t)],
      ['Replace Section', Replace, () => a.edit('replace', t)],
      ['Get Stems / MIDI', Layers, () => a.open('stems', t)],
      ['Remaster', Wand2, () => a.edit('remaster', t)],
      'divider',
      ['Open in Studio', SlidersHorizontal, () => a.openInStudio(t)],
      ['Open in Editor', Pencil, () => a.edit(null, t)],
    ],
  };

  const renderList = (rows) =>
    rows.map((r, i) =>
      r === 'divider' ? (
        <div key={`d${i}`} className="my-1 border-t border-ink-700" />
      ) : (
        <MenuRow key={r[0]} label={r[0]} Icon={r[1]} className={item} iconClass={icon} onClick={run(r[2])} />
      )
    );

  const subContent = () => {
    if (sub === 'remix' || sub === 'edit') return renderList(lists[sub]);
    if (sub === 'download')
      return (
        <>
          <button type="button" className={item} onClick={run(() => a.download(t, 'original'))}>
            <Music2 className={icon} /> {(t.format || 'mp3').toUpperCase()} audio
          </button>
          {(t.format || 'mp3') !== 'wav' && (
            <button type="button" className={item} onClick={run(() => a.download(t, 'wav'))}>
              <AudioLines className={icon} /> WAV audio
            </button>
          )}
          {t.video_url && (
            <a className={item} href={t.video_url} download onClick={() => setOpen(false)}>
              <Clapperboard className={icon} /> Music video (MP4)
            </a>
          )}
          {t.stems_urls && (
            <button type="button" className={item} onClick={run(() => a.open('stems', t))}>
              <Layers className={icon} /> Stems
            </button>
          )}
        </>
      );
    if (sub === 'manage')
      return (
        <>
          <button type="button" className={item} onClick={run(() => a.open('details', t))}>
            <Info className={icon} /> Song Details
          </button>
          {(t.format || 'mp3') !== 'wav' && (
            <button type="button" className={item} onClick={run(() => a.convertToWav(t))}>
              <AudioLines className={icon} /> Convert to WAV
            </button>
          )}
          <button type="button" className={item} onClick={run(() => a.open('cover', t))}>
            <ImageIcon className={icon} /> Create Cover Art
          </button>
          <button type="button" className={item} onClick={run(() => a.open('lyrics', t))}>
            <FileText className={icon} /> {t.lyrics ? 'Lyrics' : 'Add Lyrics'}
          </button>
          <Link href={`/video/${t.id}`} className={item} onClick={() => setOpen(false)}>
            <Clapperboard className={icon} /> {t.video_path ? 'Music Video' : 'Make Music Video'}
          </Link>
          <button type="button" className={item} onClick={run(() => a.open('release', t))}>
            <Send className={icon} /> Release (YouTube, SoundCloud, DistroKid)
          </button>
          <div className="my-1 border-t border-ink-700" />
          <button type="button" className={item} onClick={() => a.toggle(t, 'allow_remixes', 'Remixes')}>
            <Repeat2 className={icon} /> Allow Remixes <Toggle on={t.allow_remixes !== false} />
          </button>
          <button type="button" className={item} onClick={() => a.toggle(t, 'allow_comments', 'Comments')}>
            <MessageSquare className={icon} /> Allow Comments <Toggle on={t.allow_comments !== false} />
          </button>
          <button type="button" className={item} onClick={() => a.toggle(t, 'pinned', 'Pin to profile')}>
            <Pin className={icon} /> Pin to Profile <Toggle on={!!t.pinned} />
          </button>
          <div className="my-1 border-t border-ink-700" />
          <div className="label px-3 py-1">Move to Workspace</div>
          <button type="button" className={item} onClick={run(() => a.moveTo(t, null))}>
            <FolderInput className={icon} /> <span className="flex-1">My Workspace</span>
            {!t.workspace_id && <Check className="h-4 w-4 text-neon-cyan" />}
          </button>
          {a.workspaces.map((w) => (
            <button key={w.id} type="button" className={item} onClick={run(() => a.moveTo(t, w))}>
              <FolderInput className={icon} /> <span className="flex-1 truncate">{w.name}</span>
              {t.workspace_id === w.id && <Check className="h-4 w-4 text-neon-cyan" />}
            </button>
          ))}
          <div className="my-1 border-t border-ink-700" />
          <button type="button" className={`${item} !text-neon-pink`} onClick={run(() => a.remove(t))}>
            <Trash2 className="h-4 w-4" /> Move to Trash
          </button>
        </>
      );
    if (sub === 'playlist')
      return (
        <>
          <button type="button" className={item} onClick={run(() => a.newPlaylistWith(t))}>
            <Plus className={icon} /> New playlist
          </button>
          {a.playlists.map((p) => {
            const has = p.track_ids?.includes(t.id);
            return (
              <button key={p.id} type="button" className={item} disabled={has} onClick={run(() => a.addToPlaylist(t, p))}>
                <ListMusic className={icon} /> <span className="flex-1 truncate">{p.name}</span>
                {has && <Check className="h-4 w-4 text-neon-cyan" />}
              </button>
            );
          })}
        </>
      );
    return null;
  };

  const subTitles = { remix: 'Remix', edit: 'Edit', download: 'Download', manage: 'Manage', playlist: 'Add to Playlist' };

  const main = (
    <>
      {subItem('remix', 'Remix', Repeat2)}
      {subItem('edit', 'Edit', Pencil)}
      <div className="my-1 border-t border-ink-700" onMouseEnter={hoverClear} />
      <button type="button" className={item} onMouseEnter={hoverClear} onClick={run(() => a.publish(t))}>
        {t.is_public ? <Lock className={icon} /> : <Globe className={icon} />} {t.is_public ? 'Make Private' : 'Publish'}
      </button>
      <button type="button" className={item} onMouseEnter={hoverClear} onClick={run(() => a.open('share', t))}>
        <Share2 className={icon} /> Share
      </button>
      {subItem('download', 'Download', Download)}
      {subItem('manage', 'Manage', FolderInput)}
      <div className="my-1 border-t border-ink-700" onMouseEnter={hoverClear} />
      <button type="button" className={item} onMouseEnter={hoverClear} onClick={run(() => a.queue(t))}>
        <ListEnd className={icon} /> Add to Queue
      </button>
      {subItem('playlist', 'Add to Playlist', Plus)}
      <div className="my-1 border-t border-ink-700" onMouseEnter={hoverClear} />
      <button type="button" className={`${item} text-ink-300`} onMouseEnter={hoverClear} onClick={run(() => a.remove(t))}>
        <Trash2 className={icon} /> Move to Trash
      </button>
    </>
  );

  const panel = 'fixed z-[75] w-[248px] overflow-y-auto rounded-xl border border-ink-700 bg-ink-850 p-1.5 shadow-2xl';

  return (
    <div className={className}>
      <button
        ref={btnRef}
        type="button"
        className={triggerClass}
        aria-label={`More actions for ${t.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setSub(null);
          setConfirmDelete(false);
          setOpen((o) => !o);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div ref={menuRef} role="menu" className={panel} style={{ top: pos.top, left: pos.left, maxHeight: pos.maxH }}>
              {!desktop && sub ? (
                <>
                  <button type="button" className={`${item} text-ink-300`} onClick={() => setSub(null)}>
                    <ArrowLeft className={icon} /> {subTitles[sub]}
                  </button>
                  <div className="my-1 border-t border-ink-700" />
                  {subContent()}
                </>
              ) : (
                main
              )}
            </div>
            {desktop && sub && (
              <div
                ref={subRef}
                role="menu"
                className={panel}
                style={{
                  top: Math.max(12, Math.min(subTop, window.innerHeight - 440)),
                  left: pos.left > 260 ? pos.left - 252 : pos.left + 252,
                  maxHeight: Math.min(window.innerHeight - 24, 520),
                }}
              >
                {subContent()}
              </div>
            )}
          </>,
          document.body
        )}
    </div>
  );
}
