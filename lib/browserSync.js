// Syncs lyrics to the music inside the browser, for free. No API token needed.
// The speech AI runs in a background worker so the page never freezes.
// It downloads once and the browser keeps it.
import { alignLyrics, lyricLines, transcriptWords } from '@/lib/lyrics';

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

const WORKER = `
import { pipeline, env } from '${LIB}';
env.allowLocalModels = false;
let asr = null;
let opts = {};

async function load(post) {
  if (asr) return asr;
  const files = {};
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      let a = 0, b = 0;
      for (const [x, y] of Object.values(files)) { a += x; b += y; }
      post({ type: 'status', text: 'Getting the lyric AI ready (one time only) ' + Math.round((a / b) * 100) + '%' });
    }
  };
  let gpu = false;
  try { gpu = !!(self.navigator.gpu && (await self.navigator.gpu.requestAdapter())); } catch {}
  if (gpu) {
    try {
      asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
        device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback,
      });
      opts = { language: 'english', task: 'transcribe' };
      return asr;
    } catch {}
  }
  asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { dtype: 'q8', progress_callback });
  return asr;
}

self.onmessage = async (e) => {
  const post = (m) => self.postMessage(m);
  try {
    const samples = e.data.samples;
    const run = await load(post);
    const SR = 16000, SEG = 30 * SR;
    const chunks = [];
    const total = Math.ceil(samples.length / SEG);
    for (let i = 0; i < total; i++) {
      post({ type: 'status', text: 'Listening to the song and matching the words ' + Math.round((i / total) * 100) + '%' });
      const part = samples.subarray(i * SEG, Math.min(samples.length, (i + 1) * SEG));
      const off = i * 30;
      const out = await run(part, { return_timestamps: true, ...opts });
      for (const c of out.chunks || []) {
        const [s, en] = c.timestamp || [];
        chunks.push({ text: c.text, timestamp: [(s ?? 0) + off, (en ?? (s ?? 0) + 2) + off] });
      }
    }
    post({ type: 'done', result: { chunks } });
  } catch (err) {
    post({ type: 'error', message: (err && err.message) || String(err) });
  }
};
`;

let worker = null;
function getWorker() {
  if (!worker) {
    const url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));
    worker = new Worker(url, { type: 'module' });
  }
  return worker;
}

async function decode16k(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load the song (${res.status}).`);
  const buf = await res.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await ctx.decodeAudioData(buf);
  ctx.close?.();
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return { samples: out.getChannelData(0), duration: audio.duration };
}

let queue = Promise.resolve(); // one song at a time

export function syncInBrowser(track, onStatus) {
  const job = queue.then(() => run(track, onStatus));
  queue = job.catch(() => {});
  return job;
}

async function run(track, onStatus) {
  const lines = lyricLines(track.lyrics);
  if (!lines.length) throw new Error('This song has no lyrics yet.');
  if (!track.url) throw new Error("Couldn't find this song's audio.");
  onStatus?.('Loading the song');
  const { samples, duration } = await decode16k(track.url);
  const w = getWorker();
  const result = await new Promise((resolve, reject) => {
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'status') onStatus?.(m.text);
      else if (m.type === 'done') resolve(m.result);
      else if (m.type === 'error') reject(new Error(m.message));
    };
    w.onerror = (e) => reject(new Error(e.message || 'The lyric AI stopped unexpectedly.'));
    const copy = new Float32Array(samples);
    w.postMessage({ samples: copy }, [copy.buffer]);
  });
  const words = transcriptWords(result);
  if (!words.length) throw new Error('No singing was detected in this song.');
  return alignLyrics(lines, words, Number(track.duration) || duration);
}
