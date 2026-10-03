// Server-only Replicate helpers.
const BASE = 'https://api.replicate.com/v1';

function headers() {
  const token = (process.env.REPLICATE_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('REPLICATE_API_TOKEN is missing from your environment variables.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function call(url, init, extraHeaders = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers(), ...extraHeaders }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.title || `Replicate error (${res.status})`);
  return data;
}

// Song with vocals from lyrics (MiniMax Music on Replicate).
export function startSong({ prompt, lyrics }) {
  const model = process.env.REPLICATE_SONG_MODEL || 'minimax/music-1.5';
  return call(`${BASE}/models/${model}/predictions`, {
    method: 'POST',
    body: JSON.stringify({
      input: { prompt, lyrics, sample_rate: 44100, bitrate: 256000, audio_format: 'mp3' },
    }),
  }).then((p) => ({ ...p, model }));
}

// Instrumental from a text prompt (Meta MusicGen on Replicate).
export function startInstrumental({ prompt, duration }) {
  const version =
    process.env.REPLICATE_MUSICGEN_VERSION ||
    '671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';
  return call(`${BASE}/predictions`, {
    method: 'POST',
    body: JSON.stringify({
      version,
      input: {
        prompt,
        duration,
        model_version: 'stereo-large',
        output_format: 'mp3',
        normalization_strategy: 'loudness',
      },
    }),
  }).then((p) => ({ ...p, model: 'meta/musicgen' }));
}

// Album cover art (FLUX schnell). Waits up to ~8s so most covers come back in one call.
export function startCovers(prompt, count = 4) {
  return call(
    `${BASE}/models/black-forest-labs/flux-schnell/predictions`,
    {
      method: 'POST',
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: '1:1',
          num_outputs: Math.min(4, Math.max(1, count)),
          output_format: 'png',
          megapixels: '1',
          go_fast: true,
        },
      }),
    },
    { Prefer: 'wait=8' }
  );
}

// One ~5 second music-video clip (Wan 2.2 text-to-video, 480p, 16:9).
export const CLIP_SECONDS = 81 / 16;
export const CLIP_PRICE_USD = 0.05;

export function startClip(prompt) {
  const model = process.env.REPLICATE_VIDEO_MODEL || 'wan-video/wan-2.2-t2v-fast';
  return call(`${BASE}/models/${model}/predictions`, {
    method: 'POST',
    body: JSON.stringify({
      input: { prompt, num_frames: 81, frames_per_second: 16, aspect_ratio: '16:9', resolution: '480p', go_fast: true },
    }),
  });
}

// Word-level speech recognition for syncing lyrics (Whisper large-v3).
const versionCache = {};
async function latestVersion(model) {
  if (versionCache[model]) return versionCache[model];
  const m = await call(`${BASE}/models/${model}`, { method: 'GET' });
  const id = m.latest_version?.id;
  if (!id) throw new Error(`No runnable version found for ${model}.`);
  versionCache[model] = id;
  return id;
}

export async function startTranscription(audioUrl) {
  const model = process.env.REPLICATE_WHISPER_MODEL || 'vaibhavs10/incredibly-fast-whisper';
  const version = await latestVersion(model);
  return call(`${BASE}/predictions`, {
    method: 'POST',
    body: JSON.stringify({
      version,
      input: { audio: audioUrl, task: 'transcribe', timestamp: 'word', batch_size: 24, diarise_audio: false },
    }),
  });
}

// Normalises Whisper output into [{ word, start }]
export function transcriptWords(output) {
  const chunks = output?.chunks || output?.segments || [];
  const words = [];
  for (const c of chunks) {
    if (Array.isArray(c.words)) {
      for (const w of c.words) words.push({ word: w.word || w.text || '', start: Number(w.start) });
    } else {
      const start = Array.isArray(c.timestamp) ? Number(c.timestamp[0]) : Number(c.start);
      const parts = String(c.text || '').trim().split(/\s+/).filter(Boolean);
      const endT = Array.isArray(c.timestamp) ? Number(c.timestamp[1]) : Number(c.end);
      const step = parts.length > 1 && Number.isFinite(endT) ? (endT - start) / parts.length : 0;
      parts.forEach((p, i) => words.push({ word: p, start: start + step * i }));
    }
  }
  return words.filter((w) => Number.isFinite(w.start));
}

export function getPrediction(id) {
  return call(`${BASE}/predictions/${encodeURIComponent(id)}`, { method: 'GET' });
}

export function outputUrl(output) {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return outputUrl(output[0]);
  if (typeof output === 'object') return output.url || output.audio || output.audio_out || null;
  return null;
}
