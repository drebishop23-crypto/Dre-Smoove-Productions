// Server-only Replicate helpers.
const BASE = 'https://api.replicate.com/v1';

function headers() {
  const token = (process.env.REPLICATE_API_TOKEN || '').trim().replace(/^Bearer\s+/i, '').replace(/^REPLICATE_API_TOKEN\s*=\s*/, '').replace(/^["']|["']$/g, '').trim();
  if (!token) throw new Error('REPLICATE_API_TOKEN is missing from your environment variables.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function call(url, init, extraHeaders = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers(), ...extraHeaders }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const t = headers().Authorization.slice(7);
    throw new Error(`Replicate didn't accept the token the site is using. It starts with ${t.slice(0, 6)} and is ${t.length} characters long (a Replicate token is 40). Replace REPLICATE_API_TOKEN in Netlify, then redeploy.`);
  }
  if (res.status === 402) throw new Error('Your Replicate account is out of credit. Add credit at replicate.com/account/billing.');
  if (!res.ok) throw new Error(data.detail || data.title || `Replicate error (${res.status})`);
  return data;
}

const runModel = (model, input, extra) =>
  call(`${BASE}/models/${model}/predictions`, { method: 'POST', body: JSON.stringify({ input }) }, extra).then((p) => ({ ...p, model }));

const runVersion = (version, model, input, extra) =>
  call(`${BASE}/predictions`, { method: 'POST', body: JSON.stringify({ version, input }) }, extra).then((p) => ({ ...p, model }));

// Community models need a version id; look up the newest one once.
const versionCache = {};
async function latestVersion(model, fallback) {
  if (versionCache[model]) return versionCache[model];
  try {
    const m = await call(`${BASE}/models/${model}`, { method: 'GET' });
    const id = m.latest_version?.id;
    if (id) return (versionCache[model] = id);
  } catch (e) {
    if (!fallback) throw e;
  }
  if (fallback) return fallback;
  throw new Error(`No runnable version found for ${model}.`);
}

export const SONG_MODEL = () => process.env.REPLICATE_SONG_MODEL || 'minimax/music-2.6';
export const LIMITS = { prompt: 2000, lyrics: 3500, coverLyrics: 3000, refLyrics: 350 };

// Full song (up to about 6 minutes) with vocals or instrumental (MiniMax Music 2.6).
// With no lyrics and not instrumental, the model writes lyrics from the prompt.
export function startSong({ prompt, lyrics, instrumental = false }) {
  const model = SONG_MODEL();
  if (model.endsWith('music-1.5')) {
    return runModel(model, { prompt: prompt.slice(0, 300), lyrics: (lyrics || '').slice(0, 600), sample_rate: 44100, bitrate: 256000, audio_format: 'mp3' });
  }
  const input = { prompt: prompt.slice(0, LIMITS.prompt), sample_rate: 44100, bitrate: 256000, audio_format: 'mp3' };
  if (instrumental) input.is_instrumental = true;
  else if (lyrics?.trim()) input.lyrics = lyrics.slice(0, LIMITS.lyrics);
  else input.lyrics_optimizer = true;
  return runModel(model, input);
}

// Cover: same melody, new style (and optionally new lyrics). MiniMax Music Cover.
export function startCover({ audioUrl, prompt, lyrics }) {
  const input = { audio_url: audioUrl, prompt: prompt.slice(0, LIMITS.prompt), sample_rate: 44100, bitrate: 256000, audio_format: 'mp3' };
  if (lyrics?.trim()) input.lyrics = lyrics.slice(0, LIMITS.coverLyrics);
  return runModel('minimax/music-cover', input);
}

// New song guided by a reference song and/or a voice sample (MiniMax Music 01, up to 60 seconds).
export function startReference({ songUrl, voiceUrl, lyrics }) {
  const input = { lyrics: (lyrics || '').slice(0, LIMITS.refLyrics), sample_rate: 44100, bitrate: 256000 };
  if (songUrl) input.song_file = songUrl;
  if (voiceUrl) input.voice_file = voiceUrl;
  return runModel('minimax/music-01', input);
}

// MusicGen: instrumental beats, and continuing an existing clip (Extend / Sample).
const MUSICGEN_VERSION = '671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';
export function startInstrumental({ prompt, duration }) {
  return runVersion(process.env.REPLICATE_MUSICGEN_VERSION || MUSICGEN_VERSION, 'meta/musicgen', {
    prompt,
    duration,
    model_version: 'stereo-large',
    output_format: 'mp3',
    normalization_strategy: 'loudness',
  });
}

export function startContinuation({ audioUrl, prompt, duration, start = 0, end = -1 }) {
  const input = {
    prompt,
    input_audio: audioUrl,
    duration: Math.min(30, Math.max(5, Math.round(duration))),
    continuation: true,
    continuation_start: Math.max(0, Math.floor(start)),
    model_version: 'stereo-melody-large',
    output_format: 'mp3',
    normalization_strategy: 'loudness',
  };
  // Leaving continuation_end out means "to the end of the clip"; Replicate rejects negative numbers
  if (Number(end) > 0) input.continuation_end = Math.ceil(end);
  return runVersion(process.env.REPLICATE_MUSICGEN_VERSION || MUSICGEN_VERSION, 'meta/musicgen', input);
}

// Stems (vocals, drums, bass, other) with Demucs.
export async function startStems(audioUrl) {
  const version = await latestVersion('ryan5453/demucs', '5a7041cc9b82e5a558fea6b3d7b12dea89625e89da33f0447bd727c2d0ab9e77');
  return runVersion(version, 'ryan5453/demucs', { audio: audioUrl, model: 'htdemucs', format: 'mp3', mp3_bitrate: 320 });
}

// MIDI from audio with Basic Pitch.
export async function startMidi(audioUrl) {
  const version = await latestVersion('rhelsing/basic-pitch', 'a7cf33cf63fca9c71f2235332af5a9fdfb7d23c459a0dc429daa203ff8e80c78');
  return runVersion(version, 'rhelsing/basic-pitch', { audio_file: audioUrl });
}

// Lyrics writer (Llama 3 70B). Usually answers within the wait window.
export function startLyrics(idea) {
  const system =
    'You are a professional songwriter. Write original, singable song lyrics. ' +
    'Use section tags on their own lines: [Intro], [Verse], [Pre-Chorus], [Chorus], [Bridge], [Outro]. ' +
    'Rhyme naturally, keep lines short enough to sing, and repeat the chorus. ' +
    'Return only the lyrics with a title on the first line as "Title: ...". No commentary.';
  return runModel(
    'meta/meta-llama-3-70b-instruct',
    { prompt: `Write a full song about: ${idea}`, system_prompt: system, max_tokens: 900, temperature: 0.8, top_p: 0.9 },
    { Prefer: 'wait=20' }
  );
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

// Album cover made from your own photo (FLUX Kontext Pro keeps the person/scene and restyles it).
export function startPhotoCover(prompt, imageUrl, aspect = '1:1') {
  return runModel(
    'black-forest-labs/flux-kontext-pro',
    { prompt, input_image: imageUrl, aspect_ratio: aspect, output_format: 'png', safety_tolerance: 2 },
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

// Word-level speech recognition (Whisper). Lyrics now sync in the browser; kept as a fallback.
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
export { transcriptWords } from './lyrics';

export function getPrediction(id) {
  return call(`${BASE}/predictions/${encodeURIComponent(id)}`, { method: 'GET' });
}

export function outputUrl(output) {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return outputUrl(output[0]);
  if (typeof output === 'object') return output.url || output.audio || output.audio_out || output.mid || output.midi || null;
  return null;
}

// Every URL in an output, keyed by name when the model returns an object (e.g. stems).
export function outputUrls(output) {
  if (!output) return {};
  if (typeof output === 'string') return { main: output };
  if (Array.isArray(output)) return Object.fromEntries(output.filter((u) => typeof u === 'string').map((u, i) => [String(i), u]));
  if (typeof output === 'object') {
    return Object.fromEntries(Object.entries(output).filter(([, v]) => typeof v === 'string' && /^https?:/.test(v)));
  }
  return {};
}
