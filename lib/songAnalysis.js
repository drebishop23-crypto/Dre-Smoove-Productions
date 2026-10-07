// "Listens" to a song in the browser: tempo (BPM), how loud/intense each part is,
// where the big moments are, and which lyric is being sung when. The AI director
// uses this to plan a video that follows the song.
import { decodeFromUrl } from '@/lib/audio';
import { activeLine, lyricLines } from '@/lib/lyrics';

function mono(buf) {
  const a = buf.getChannelData(0);
  if (buf.numberOfChannels < 2) return a;
  const b = buf.getChannelData(1);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

// Tempo from the rhythm of sudden energy jumps (onsets), via autocorrelation
function estimateBpm(x, rate) {
  const hop = 512;
  const n = Math.floor(x.length / hop);
  const env = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) s += x[j] * x[j];
    const e = Math.sqrt(s / hop);
    env[i] = Math.max(0, e - prev);
    prev = e;
  }
  const fps = rate / hop;
  let best = 0;
  let bestLag = 0;
  const minLag = Math.floor((fps * 60) / 180);
  const maxLag = Math.ceil((fps * 60) / 60);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += env[i] * env[i - lag];
    // gently prefer common tempos around 90-120
    const bpm = (60 * fps) / lag;
    const w = 1 - Math.min(0.3, Math.abs(bpm - 100) / 400);
    if (s * w > best) {
      best = s * w;
      bestLag = lag;
    }
  }
  return bestLag ? Math.round((60 * fps) / bestLag) : null;
}

// One entry per clip-length window: start time, energy (0-1), level label, lyric
export async function analyzeSong(track, clipSeconds, onStatus) {
  onStatus?.('Listening to the song');
  const buf = await decodeFromUrl(track.url);
  const x = mono(buf);
  const rate = buf.sampleRate;
  const duration = buf.duration;
  onStatus?.('Finding the tempo and the big moments');
  const bpm = estimateBpm(x, rate);

  const count = Math.ceil(duration / clipSeconds);
  const rms = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor(i * clipSeconds * rate);
    const b = Math.min(x.length, Math.floor((i + 1) * clipSeconds * rate));
    let s = 0;
    for (let j = a; j < b; j += 4) s += x[j] * x[j];
    rms.push(Math.sqrt(s / Math.max(1, (b - a) / 4)));
  }
  const sorted = [...rms].sort((p, q) => p - q);
  const lo = sorted[Math.floor(sorted.length * 0.1)] || 0;
  const hi = sorted[Math.floor(sorted.length * 0.9)] || 1;
  const energy = rms.map((r) => Math.max(0, Math.min(1, (r - lo) / Math.max(1e-6, hi - lo))));

  // Lyrics per window: exact when the song is synced, otherwise spread evenly
  const synced = track.lyrics_synced?.length ? track.lyrics_synced : null;
  const lines = lyricLines(track.lyrics || '');
  const segments = energy.map((e, i) => {
    const start = i * clipSeconds;
    let lyric = '';
    if (synced) {
      const idx = activeLine(synced, start + clipSeconds / 2);
      lyric = idx >= 0 ? synced[idx].text : '';
      if (idx >= 0 && synced[idx].t + 12 < start) lyric = ''; // long instrumental gap
    } else if (lines.length) {
      lyric = lines[Math.min(lines.length - 1, Math.floor((i / count) * lines.length))];
    }
    const level = e > 0.72 ? 'peak' : e > 0.42 ? 'medium' : 'calm';
    return { i, start: Math.round(start * 10) / 10, energy: Math.round(e * 100) / 100, level, lyric };
  });
  return { bpm, duration, segments, lyricsTimed: !!synced };
}
