'use client';
import { useEffect, useState } from 'react';
import { decodeFromUrl, peaksFromBuffer } from '@/lib/audio';
import { api } from '@/lib/api';

const cache = new Map();

// Returns waveform peaks for a track. Uses stored peaks when present,
// otherwise decodes the audio once and saves the result back to the track.
export function usePeaks(track) {
  const [peaks, setPeaks] = useState(() => track?.peaks || cache.get(track?.id) || null);

  useEffect(() => {
    if (!track) return setPeaks(null);
    if (track.peaks?.length) return setPeaks(track.peaks);
    if (cache.has(track.id)) return setPeaks(cache.get(track.id));
    if (!track.url) return setPeaks(null);
    let alive = true;
    setPeaks(null);
    decodeFromUrl(track.url)
      .then((buf) => {
        const p = peaksFromBuffer(buf);
        cache.set(track.id, p);
        if (alive) setPeaks(p);
        api.updateTrack(track.id, { peaks: p, duration: Math.round(buf.duration * 10) / 10 }).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [track?.id, track?.url, track?.peaks]);

  return peaks;
}
