// Keep a song going with AI for as long as you want: the AI adds about 20 seconds
// at a time, each time listening to the newest 10 seconds, until the target is reached.
import { api } from '@/lib/api';
import { decodeFromUrl, encodeWav, formatTime } from '@/lib/audio';
import { appendContinuation, slice } from '@/lib/audioEdit';

const STEP = 20;

export async function extendWithAI(buffer, addSecs, { prompt, trackId, onStatus } = {}) {
  let b = buffer;
  const goal = buffer.duration + addSecs;
  let round = 0;
  const rounds = Math.ceil(addSecs / STEP);
  while (b.duration < goal - 2) {
    round++;
    const want = Math.min(STEP, Math.max(5, goal - b.duration));
    const promptSecs = Math.min(10, b.duration);
    onStatus?.(`Part ${round} of ${rounds}: sending the last ${Math.round(promptSecs)} seconds`);
    const wav = encodeWav(slice(b, b.duration - promptSecs, b.duration));
    const path = await api.uploadAudio(new File([wav], 'extend-prompt.wav', { type: 'audio/wav' }));
    const res = await api.runJob(
      { kind: 'extend', track_id: trackId || null, audio_path: path, prompt, seconds: want },
      (m) => onStatus?.(`Part ${round} of ${rounds}: ${m.toLowerCase()}`)
    );
    const cont = await decodeFromUrl(res.clip_url);
    const before = b.duration;
    b = await appendContinuation(b, cont, promptSecs);
    if (b.duration <= before + 1) break; // the AI returned nothing new
    onStatus?.(`Now ${formatTime(b.duration)} long`);
  }
  return b;
}
