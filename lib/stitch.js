'use client';
// Builds a full-length music video in the browser: joins the AI clips end to
// end, lays the song underneath, and trims to the song's length.
// The ffmpeg engine is served from /public/ffmpeg and loaded natively (not through
// the Next.js bundler), because its web worker needs a real dynamic import().
import { fetchFile } from '@ffmpeg/util';

let instance = null;

async function getFFmpeg() {
  if (instance) return instance;
  const { FFmpeg } = await import(/* webpackIgnore: true */ '/ffmpeg/index.js');
  const ff = new FFmpeg();
  const origin = window.location.origin;
  await ff.load({
    coreURL: `${origin}/ffmpeg/ffmpeg-core.js`,
    wasmURL: `${origin}/ffmpeg/ffmpeg-core.wasm`,
  });
  instance = ff;
  return ff;
}

// clipUrls: ordered list of ~5s mp4 clips. audioUrl: the song. duration: song length in seconds.
export async function stitchVideo({ clipUrls, audioUrl, audioExt = 'wav', duration, clipSeconds, onProgress = () => {} }) {
  onProgress({ stage: 'Loading the video engine', pct: 0 });
  const ff = await getFFmpeg();

  const names = [];
  for (let i = 0; i < clipUrls.length; i++) {
    const name = `c${String(i).padStart(4, '0')}.mp4`;
    await ff.writeFile(name, await fetchFile(clipUrls[i]));
    names.push(name);
    onProgress({ stage: `Gathering clips (${i + 1} of ${clipUrls.length})`, pct: ((i + 1) / clipUrls.length) * 40 });
  }

  // Repeat the clip list if it is shorter than the song so the video never ends early
  const order = [...names];
  if (duration && clipSeconds) {
    while (order.length * clipSeconds < duration + 1) order.push(...names);
  }
  await ff.writeFile('list.txt', order.map((n) => `file '${n}'`).join('\n'));

  onProgress({ stage: 'Loading the song', pct: 42 });
  const songName = `song.${audioExt}`;
  await ff.writeFile(songName, await fetchFile(audioUrl));

  const onFF = ({ progress }) => {
    if (Number.isFinite(progress)) onProgress({ stage: 'Building the video', pct: 45 + Math.min(1, progress) * 50 });
  };
  ff.on('progress', onFF);
  try {
    const code = await ff.exec([
      '-f', 'concat', '-safe', '0', '-i', 'list.txt',
      '-i', songName,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-shortest', '-movflags', '+faststart',
      'out.mp4',
    ]);
    if (code !== 0) throw new Error('The video could not be built from these clips.');
  } finally {
    ff.off('progress', onFF);
  }

  const data = await ff.readFile('out.mp4');
  for (const n of [...names, 'list.txt', songName, 'out.mp4']) await ff.deleteFile(n).catch(() => {});
  onProgress({ stage: 'Done', pct: 100 });
  return new Blob([data.buffer], { type: 'video/mp4' });
}
