'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';

const PlayerContext = createContext(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}

// One <audio> element for the whole app. It lives in the root layout, so
// playback keeps going when you move between Studio and Library.
export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  const loadedId = useRef(null);
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.9);
  const [error, setError] = useState(null);

  const current = index >= 0 ? queue[index] || null : null;

  const queueRef = useRef(queue);
  const indexRef = useRef(index);
  queueRef.current = queue;
  indexRef.current = index;

  useEffect(() => {
    const a = new Audio();
    a.preload = 'metadata';
    audioRef.current = a;
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onErr = () => {
      setPlaying(false);
      setError('This track could not be played. The link may have expired; refresh the page.');
    };
    const onEnded = () => {
      const i = indexRef.current;
      if (i < queueRef.current.length - 1) setIndex(i + 1);
      else setPlaying(false);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('error', onErr);
    a.addEventListener('ended', onEnded);
    return () => {
      a.pause();
      a.src = '';
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('error', onErr);
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  // Load a new source whenever the current track changes
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current?.url) return;
    if (loadedId.current === current.id) return;
    loadedId.current = current.id;
    setError(null);
    setTime(0);
    setDuration(current.duration || 0);
    a.src = current.url;
    a.play().catch(() => setPlaying(false));
    api.trackStat?.(current.id, 'play').catch?.(() => {});
  }, [current?.id, current?.url]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const playTrack = useCallback((track, list) => {
    const q = list && list.length ? list : [track];
    const i = Math.max(0, q.findIndex((t) => t.id === track.id));
    const a = audioRef.current;
    if (loadedId.current === track.id && a) {
      setQueue(q);
      setIndex(i);
      a.paused ? a.play().catch(() => {}) : a.pause();
      return;
    }
    setQueue(q);
    setIndex(i);
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !loadedId.current) return;
    a.paused ? a.play().catch(() => {}) : a.pause();
  }, []);

  const next = useCallback(() => {
    setIndex((i) => (i < queueRef.current.length - 1 ? i + 1 : i));
  }, []);

  const prev = useCallback(() => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const seek = useCallback((fraction) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    a.currentTime = Math.max(0, Math.min(1, fraction)) * a.duration;
    setTime(a.currentTime);
  }, []);

  // Keep queue entries in sync after metadata edits (title, artwork, etc.)
  const syncTrack = useCallback((track) => {
    setQueue((q) => q.map((t) => (t.id === track.id ? { ...t, ...track } : t)));
  }, []);

  const removeTrack = useCallback((id) => {
    if (loadedId.current === id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      loadedId.current = null;
      setQueue([]);
      setIndex(-1);
      return;
    }
    setQueue((q) => {
      const cur = q[indexRef.current];
      const nq = q.filter((t) => t.id !== id);
      setIndex(cur ? nq.findIndex((t) => t.id === cur.id) : -1);
      return nq;
    });
  }, []);

  const value = useMemo(
    () => ({
      current,
      queue,
      playing,
      time,
      duration: duration || current?.duration || 0,
      volume,
      error,
      playTrack,
      toggle,
      next,
      prev,
      seek,
      setVolume: setVolumeState,
      syncTrack,
      removeTrack,
      isCurrent: (id) => current?.id === id,
    }),
    [current, queue, playing, time, duration, volume, error, playTrack, toggle, next, prev, seek, syncTrack, removeTrack]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
