// Server-only Replicate helpers.
const BASE = 'https://api.replicate.com/v1';

function headers() {
  const token = process.env.REPLICATE_API_TOKEN;
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
