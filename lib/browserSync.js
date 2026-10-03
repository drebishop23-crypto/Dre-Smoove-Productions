// Syncs lyrics to the music inside the browser, for free. No API token needed.
// A small speech-recognition model (Whisper) downloads once and is cached by the browser.
import { alignLyrics, lyricLines, transcriptWords } from '@/lib/lyrics';

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL = 'Xenova/whisper-base.en';
let asrPromise = null;

function loadRecognizer(onStatus) {
  if (!asrPromise) {
    asrPromise = (async () => {
      const { pipeline, env } = await import(/* webpackIgnore: true */ LIB);
      env.allowLocalModels = false;
      const files = {};
      return pipeline('automatic-speech-recognition', MODEL, {
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) {
            files[p.file] = [p.loaded, p.total];
            const [a, b] = Object.values(files).reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0]);
            onStatus?.(`Getting the lyric AI ready (one time only) ${Math.round((a / b) * 100)}%`);
          }
        },
      });
    })().catch((e) => {
      asrPromise = null;
      throw e;
    });
  }
  return asrPromise;
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

export async function syncInBrowser(track, onStatus) {
  const lines = lyricLines(track.lyrics);
  if (!lines.length) throw new Error('This song has no lyrics yet.');
  if (!track.url) throw new Error("Couldn't find this song's audio.");
  onStatus?.('Getting the lyric AI ready');
  const asr = await loadRecognizer(onStatus);
  onStatus?.('Loading the song');
  const { samples, duration } = await decode16k(track.url);
  onStatus?.('Listening to the song and matching the words');
  const result = await asr(samples, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
  const words = transcriptWords(result);
  if (!words.length) throw new Error('No singing was detected in this song.');
  return alignLyrics(lines, words, Number(track.duration) || duration);
}
