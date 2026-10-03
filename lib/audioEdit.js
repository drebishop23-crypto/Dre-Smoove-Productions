// Browser audio editing: cut, splice, fade, reverse, speed, remaster, mixdown.
// Everything works on Web Audio AudioBuffers and runs on your own computer, free.
import { SoundTouch, SimpleFilter } from 'soundtouchjs';

export function makeBuffer(channels, length, sampleRate) {
  return new AudioBuffer({ numberOfChannels: Math.max(1, channels), length: Math.max(1, Math.floor(length)), sampleRate });
}

const secToFrame = (buf, s) => Math.max(0, Math.min(buf.length, Math.round(s * buf.sampleRate)));

export function slice(buf, start, end) {
  const a = secToFrame(buf, start);
  const b = Math.max(a + 1, secToFrame(buf, end));
  const out = makeBuffer(buf.numberOfChannels, b - a, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b), c);
  return out;
}

// Same sample rate and channel count as `like`, so buffers can be joined.
export async function conform(buf, like) {
  if (buf.sampleRate === like.sampleRate && buf.numberOfChannels === like.numberOfChannels) return buf;
  const len = Math.ceil(buf.duration * like.sampleRate);
  const ctx = new OfflineAudioContext(like.numberOfChannels, len, like.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

// Join buffers end to end, with a short equal-power crossfade at each seam.
export function concat(parts, xfade = 0.03) {
  const list = parts.filter((p) => p && p.length > 1);
  if (!list.length) throw new Error('Nothing left to join.');
  const rate = list[0].sampleRate;
  const ch = list[0].numberOfChannels;
  const xf = Math.round(xfade * rate);
  let total = list.reduce((s, p) => s + p.length, 0) - xf * (list.length - 1);
  const out = makeBuffer(ch, total, rate);
  let pos = 0;
  list.forEach((p, i) => {
    const overlap = i === 0 ? 0 : Math.min(xf, p.length, pos);
    const start = pos - overlap;
    for (let c = 0; c < ch; c++) {
      const src = p.getChannelData(Math.min(c, p.numberOfChannels - 1));
      const dst = out.getChannelData(c);
      for (let j = 0; j < p.length; j++) {
        const k = start + j;
        if (k >= dst.length) break;
        if (j < overlap) {
          const t = j / overlap;
          dst[k] = dst[k] * Math.cos((t * Math.PI) / 2) + src[j] * Math.sin((t * Math.PI) / 2);
        } else dst[k] = src[j];
      }
    }
    pos = start + p.length;
  });
  return out;
}

export const crop = (buf, s, e) => slice(buf, s, e);
export const removeRange = (buf, s, e) => concat([slice(buf, 0, s), slice(buf, e, buf.duration)]);

export function reverse(buf, s = 0, e = buf.duration) {
  const out = cloneBuffer(buf);
  const a = secToFrame(buf, s);
  const b = secToFrame(buf, e);
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    d.subarray(a, b).reverse();
  }
  return out;
}

export function cloneBuffer(buf) {
  const out = makeBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c), c);
  return out;
}

// Fade in from 0 over `secs` (or fade out over the last `secs`). Smooth S-curve.
export function fade(buf, type, secs) {
  const out = cloneBuffer(buf);
  const n = Math.min(out.length, Math.round(secs * out.sampleRate));
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const g = 0.5 - 0.5 * Math.cos((i / n) * Math.PI);
      if (type === 'in') d[i] *= g;
      else d[d.length - 1 - i] *= g;
    }
  }
  return out;
}

// Change speed. keepPitch uses time-stretching so the key stays the same.
export async function changeSpeed(buf, rate, keepPitch = true) {
  if (Math.abs(rate - 1) < 0.001) return buf;
  if (!keepPitch) {
    const len = Math.ceil(buf.length / rate);
    const ctx = new OfflineAudioContext(buf.numberOfChannels, len, buf.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(ctx.destination);
    src.start();
    return ctx.startRendering();
  }
  const st = new SoundTouch(buf.sampleRate);
  st.tempo = rate;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const source = {
    extract(target, numFrames = 0, position = 0) {
      const n = Math.max(0, Math.min(numFrames, L.length - position));
      for (let i = 0; i < n; i++) {
        target[i * 2] = L[position + i];
        target[i * 2 + 1] = R[position + i];
      }
      return n;
    },
  };
  const filter = new SimpleFilter(source, st);
  const chunk = 8192;
  const tmp = new Float32Array(chunk * 2);
  const outL = [];
  const outR = [];
  let total = 0;
  for (;;) {
    const n = filter.extract(tmp, chunk);
    if (!n) break;
    outL.push(tmp.slice(0, n * 2));
    total += n;
    if (total > (buf.length / rate) * 1.2 + buf.sampleRate) break;
  }
  const out = makeBuffer(buf.numberOfChannels > 1 ? 2 : 1, total, buf.sampleRate);
  const oL = out.getChannelData(0);
  const oR = out.numberOfChannels > 1 ? out.getChannelData(1) : null;
  let pos = 0;
  for (const block of outL) {
    for (let i = 0; i < block.length / 2; i++) {
      oL[pos + i] = block[i * 2];
      if (oR) oR[pos + i] = block[i * 2 + 1];
    }
    pos += block.length / 2;
  }
  void outR;
  return out;
}

function rms(buf) {
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] * d[i];
      n++;
    }
  }
  return Math.sqrt(sum / Math.max(1, n));
}

// Look-ahead peak limiter so nothing clips.
function limit(buf, ceiling = 0.93) {
  const look = Math.round(0.004 * buf.sampleRate);
  const release = Math.exp(-1 / (0.08 * buf.sampleRate));
  const len = buf.length;
  const peak = new Float32Array(len);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) peak[i] = Math.max(peak[i], Math.abs(d[i]));
  }
  // Max of the next `look` samples at every point (sliding window), so gain drops before a peak arrives
  const need = new Float32Array(len);
  const q = new Int32Array(len);
  let head = 0;
  let tail = 0;
  let g = 1;
  for (let j = 0; j < len + look; j++) {
    if (j < len) {
      while (tail > head && peak[q[tail - 1]] <= peak[j]) tail--;
      q[tail++] = j;
    }
    const i = j - look;
    if (i >= 0) {
      while (q[head] < i) head++;
      need[i] = peak[q[head]];
    }
  }
  for (let i = 0; i < len; i++) {
    const target = need[i] > ceiling ? ceiling / need[i] : 1;
    g = target < g ? target : target + (g - target) * release;
    for (let c = 0; c < buf.numberOfChannels; c++) buf.getChannelData(c)[i] *= g;
  }
  return buf;
}

export const REMASTER_PRESETS = {
  balanced: { label: 'Balanced', low: 1.5, mid: 0, high: 2, target: 0.2 },
  warm: { label: 'Warm', low: 3, mid: -1, high: 0.5, target: 0.19 },
  bright: { label: 'Bright', low: 0.5, mid: 1, high: 3.5, target: 0.2 },
  loud: { label: 'Loud', low: 2, mid: 0.5, high: 2.5, target: 0.25 },
};

// Mastering chain: clean lows, tone shaping, glue compression, loudness and limiting.
export async function remaster(buf, presetKey = 'balanced') {
  const p = REMASTER_PRESETS[presetKey] || REMASTER_PRESETS.balanced;
  const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 28;
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 110;
  low.gain.value = p.low;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 2800;
  mid.Q.value = 0.8;
  mid.gain.value = p.mid;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 9500;
  high.gain.value = p.high;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 8;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.015;
  comp.release.value = 0.2;
  src.connect(hp).connect(low).connect(mid).connect(high).connect(comp).connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  const gain = p.target / Math.max(1e-4, rms(out));
  for (let c = 0; c < out.numberOfChannels; c++) {
    const d = out.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  return limit(out);
}

// Replace a range with new audio (Replace Section).
export async function replaceRange(buf, s, e, insert) {
  const fit = await conform(insert, buf);
  return concat([slice(buf, 0, s), fit, slice(buf, e, buf.duration)], 0.08);
}

function envelope(buf, from, to, step = 0.05) {
  const d = buf.getChannelData(0);
  const out = [];
  for (let t = from; t < to; t += step) {
    const a = Math.round(t * buf.sampleRate);
    const b = Math.min(d.length, a + Math.round(step * buf.sampleRate));
    let s = 0;
    for (let i = a; i < b; i++) s += d[i] * d[i];
    out.push(Math.sqrt(s / Math.max(1, b - a)));
  }
  return out;
}

function correlation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 10) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sx += (x[i] - mx) ** 2;
    sy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sx * sy || 1);
}

// Extend: the AI continues from the last `promptSecs` of the song. Some models return
// the prompt + continuation, others only the new part; this lines up either one.
export async function appendContinuation(buf, cont, promptSecs) {
  const fit = await conform(cont, buf);
  const from = Math.max(0, buf.duration - promptSecs);
  const a = envelope(buf, from, buf.duration);
  const b = envelope(fit, 0, Math.min(promptSecs, fit.duration));
  if (correlation(a, b) > 0.75) return concat([slice(buf, 0, from), fit], 0.02);
  return concat([buf, fit], 0.6);
}

// Mix many clips down to one stereo buffer (Studio export).
export async function mixdown(items, length, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(length * sampleRate)), sampleRate);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  for (const it of items) {
    const src = ctx.createBufferSource();
    src.buffer = it.buffer;
    const g = ctx.createGain();
    g.gain.value = it.gain ?? 1;
    src.connect(g).connect(master);
    src.start(Math.max(0, it.start), Math.max(0, it.offset || 0), Math.max(0.01, it.duration));
  }
  const out = await ctx.startRendering();
  // Gentle safety limiter
  return limit(out, 0.97);
}

// Waveform min/max columns for drawing.
export function columns(buf, count) {
  const d0 = buf.getChannelData(0);
  const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0;
  const per = Math.max(1, Math.floor(buf.length / count));
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    let lo = 0, hi = 0;
    const a = i * per;
    const b = Math.min(buf.length, a + per);
    for (let j = a; j < b; j += 8) {
      const v = (d0[j] + d1[j]) / 2;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out[i * 2] = lo;
    out[i * 2 + 1] = hi;
  }
  return out;
}
