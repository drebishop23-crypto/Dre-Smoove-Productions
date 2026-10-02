// Client-side audio helpers: waveform peaks, WAV export, downloads, time formatting.

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

let sharedCtx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!sharedCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}

export async function decodeFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load audio (${res.status})`);
  const buf = await res.arrayBuffer();
  return getCtx().decodeAudioData(buf);
}

export async function decodeFromFile(file) {
  const buf = await file.arrayBuffer();
  return getCtx().decodeAudioData(buf);
}

// Reduce an AudioBuffer to `bars` normalized peak values (0..1).
export function peaksFromBuffer(audioBuffer, bars = 180) {
  const channels = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) channels.push(audioBuffer.getChannelData(c));
  const len = channels[0].length;
  const block = Math.max(1, Math.floor(len / bars));
  const peaks = [];
  let max = 0;
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    const start = i * block;
    const end = Math.min(start + block, len);
    for (let j = start; j < end; j += 16) {
      for (const ch of channels) {
        const v = Math.abs(ch[j]);
        if (v > peak) peak = v;
      }
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  return peaks.map((p) => Math.round((max ? p / max : 0) * 1000) / 1000);
}

// Encode an AudioBuffer as 16-bit PCM WAV.
export function encodeWav(audioBuffer) {
  const numCh = audioBuffer.numberOfChannels;
  const rate = audioBuffer.sampleRate;
  const len = audioBuffer.length;
  const bytesPerSample = 2;
  const dataSize = len * numCh * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(audioBuffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFilename(title) {
  return (title || 'track').replace(/[^\w\s.-]+/g, '').trim().replace(/\s+/g, '-') || 'track';
}

// format: 'original' | 'wav'
export async function downloadTrack(track, format = 'original') {
  const base = safeFilename(track.title);
  if (format === 'wav') {
    const decoded = await decodeFromUrl(track.url);
    downloadBlob(encodeWav(decoded), `${base}.wav`);
    return;
  }
  const res = await fetch(track.url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const ext = track.format || (blob.type.includes('wav') ? 'wav' : 'mp3');
  downloadBlob(blob, `${base}.${ext}`);
}
