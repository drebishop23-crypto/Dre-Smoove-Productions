// Preview-only stand-in for lib/api.js. Same function names and return shapes,
// backed by in-memory data and audio synthesized in the browser.
import { encodeWav } from '@/lib/audio';

const SR = 22050;
let noise = null;

function rng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

async function renderBeat({ seed, bpm = 86, root = 57, seconds = 14, vocal = false, style = 'rnb' }) {
  const ctx = new OfflineAudioContext(2, SR * seconds, SR);
  const rand = rng(seed);
  if (!noise || noise.sampleRate !== SR) {
    noise = ctx.createBuffer(1, SR, SR);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = Math.floor(seconds / bar);
  const chords = [
    [0, 3, 7, 10, 14],
    [8, 12, 15, 19],
    [3, 7, 10, 14],
    [10, 14, 17, 21],
  ];
  const shift = Math.floor(rand() * 4);

  // Pads
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = style === 'trap' ? 1400 : 2200;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.09;
  padFilter.connect(padGain).connect(master);

  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    const chord = chords[(b + shift) % 4];
    chord.forEach((iv, k) => {
      const o = ctx.createOscillator();
      o.type = k % 2 ? 'triangle' : 'sine';
      o.frequency.value = hz(root - 12 + iv);
      o.detune.value = (rand() - 0.5) * 12;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.9, t + 0.08);
      g.gain.setTargetAtTime(0.35, t + 0.2, 0.6);
      g.gain.linearRampToValueAtTime(0, t + bar);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (k / chord.length) * 1.2 - 0.6;
      o.connect(g).connect(pan).connect(padFilter);
      o.start(t);
      o.stop(t + bar + 0.05);
    });

    // Bass
    for (let q = 0; q < 4; q++) {
      if (q === 1 && rand() < 0.5) continue;
      const bt = t + q * beat + (q === 3 ? beat / 2 : 0);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(root - 24 + chord[0]);
      const g = ctx.createGain();
      const len = style === 'trap' ? beat * 1.6 : beat * 0.8;
      g.gain.setValueAtTime(0.0001, bt);
      g.gain.exponentialRampToValueAtTime(0.45, bt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, bt + len);
      o.connect(g).connect(master);
      o.start(bt);
      o.stop(bt + len + 0.02);
    }
  }

  const kick = (t) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.4);
  };
  const hit = (t, freq, len, vol, type = 'highpass') => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f).connect(g).connect(master);
    s.start(t, rand() * 0.5);
    s.stop(t + len + 0.02);
  };

  const steps = bars * 16;
  const step = beat / 4;
  for (let i = 0; i < steps; i++) {
    const t = i * step + (i % 2 ? step * 0.12 : 0); // swing
    const s = i % 16;
    if (s === 0 || s === 10 || (style === 'trap' && s === 7)) kick(t);
    if (s === 4 || s === 12) hit(t, 1800, 0.18, 0.35, 'bandpass');
    if (style === 'trap' ? true : s % 2 === 0) hit(t, 7000, 0.04, style === 'trap' ? 0.08 : 0.12);
  }

  // Lead line standing in for a vocal
  if (vocal) {
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const lf = ctx.createBiquadFilter();
    lf.type = 'bandpass';
    lf.frequency.value = 1100;
    lf.Q.value = 0.9;
    const lg = ctx.createGain();
    lg.gain.value = 0.16;
    lf.connect(lg).connect(master);
    for (let b = 1; b < bars; b++) {
      for (let n = 0; n < 6; n++) {
        if (rand() < 0.25) continue;
        const t = b * bar + n * (bar / 6);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(root + scale[Math.floor(rand() * scale.length)]);
        const vib = ctx.createOscillator();
        vib.frequency.value = 5.5;
        const vg = ctx.createGain();
        vg.gain.value = 6;
        vib.connect(vg).connect(o.frequency);
        const g = ctx.createGain();
        const len = bar / 6 - 0.03;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.9, t + 0.05);
        g.gain.linearRampToValueAtTime(0, t + len);
        o.connect(g).connect(lf);
        o.start(t);
        vib.start(t);
        o.stop(t + len + 0.02);
        vib.stop(t + len + 0.02);
      }
    }
  }

  const out = await ctx.startRendering();
  return URL.createObjectURL(encodeWav(out));
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const SEED = [
  { id: 't1', title: 'Late Night Cruise', source: 'upload', tags: ['R&B', 'Smooth', 'Demo'], release_date: '2026-08-14', created_at: daysAgo(9), synth: { bpm: 78, root: 57 } },
  { id: 't2', title: 'Smoove Operator', source: 'upload', tags: ['Neo-Soul', 'Final Mix'], release_date: '2026-06-20', created_at: daysAgo(30), synth: { bpm: 84, root: 60 } },
  { id: 't3', title: 'Block Party Intro', source: 'upload', tags: ['Hip-Hop', 'Boom Bap', 'DJ Set'], release_date: '2026-05-02', created_at: daysAgo(44), synth: { bpm: 92, root: 55 } },
  { id: 't4', title: 'Velvet Hour', source: 'ai', tags: ['R&B', 'Late night', 'Romantic'], created_at: daysAgo(1), model: 'minimax/music-1.5', synth: { bpm: 72, root: 58, vocal: true },
    prompt: 'R&B, Late night, Romantic. Silky male vocal, warm Rhodes, slow 72 BPM groove',
    lyrics: '[Verse]\nCandle low and the city hum\nYou say my name like a slow drum\n\n[Chorus]\nVelvet hour, stay right here\nEvery word soft in my ear' },
  { id: 't5', title: '808 Sunrise', source: 'ai', tags: ['Trap', 'Uplifting'], created_at: daysAgo(3), model: 'meta/musicgen', synth: { bpm: 140, root: 53, style: 'trap' },
    prompt: 'Trap, Uplifting. Bright bells, rolling hi-hats, gliding 808' },
  { id: 't6', title: 'Sunday Keys Sketch', source: 'ai', tags: ['Gospel', 'Jazz'], created_at: daysAgo(6), model: 'meta/musicgen', synth: { bpm: 68, root: 62 },
    prompt: 'Gospel, Jazz. Organ swells, walking bass, brushed drums' },
];

let tracks = [];
let playlists = [
  { id: 'p1', name: 'Friday Night Set', created_at: daysAgo(20), track_ids: ['t3', 't1', 't5'] },
  { id: 'p2', name: 'Demos in Progress', created_at: daysAgo(12), track_ids: ['t1', 't4'] },
];
const jobs = new Map();
let ready = null;

function strip(t) {
  const { synth, ...rest } = t;
  return rest;
}

function boot() {
  if (!ready) {
    ready = Promise.all(
      SEED.map(async (s) => ({
        artist: 'Dré Smoove',
        format: 'wav',
        duration: 14,
        peaks: null,
        artwork_url: null,
        release_date: null,
        ...strip(s),
        url: await renderBeat({ seed: s.id, seconds: 14, ...s.synth }),
      }))
    ).then((list) => {
      tracks = list;
    });
  }
  return ready;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (x) => JSON.parse(JSON.stringify(x));

export const api = {
  async listTracks(params = {}) {
    await boot();
    await wait(250);
    let list = tracks;
    if (params.source) list = list.filter((t) => t.source === params.source);
    return { tracks: [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)) };
  },
  async updateTrack(id, patch) {
    tracks = tracks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    return { track: tracks.find((t) => t.id === id) };
  },
  async deleteTrack(id) {
    tracks = tracks.filter((t) => t.id !== id);
    playlists = playlists.map((p) => ({ ...p, track_ids: p.track_ids.filter((x) => x !== id) }));
    return { ok: true };
  },
  async uploadTrack(file, meta = {}) {
    await wait(700);
    const track = {
      id: `u${Date.now()}`,
      artist: 'Dré Smoove',
      source: 'upload',
      artwork_url: null,
      created_at: new Date().toISOString(),
      format: (file.name.split('.').pop() || 'mp3').toLowerCase(),
      ...meta,
      url: URL.createObjectURL(file),
    };
    tracks = [track, ...tracks];
    return { track };
  },
  async uploadArtwork(trackId, file) {
    await wait(300);
    return api.updateTrack(trackId, { artwork_url: URL.createObjectURL(file) });
  },
  async listPlaylists() {
    await boot();
    return { playlists: clone(playlists) };
  },
  async createPlaylist(name) {
    const p = { id: `p${Date.now()}`, name, created_at: new Date().toISOString(), track_ids: [] };
    playlists = [...playlists, p];
    return { playlist: clone(p) };
  },
  async updatePlaylist(id, body) {
    playlists = playlists.map((p) => {
      if (p.id !== id) return p;
      let ids = p.track_ids;
      if (body.add && !ids.includes(body.add)) ids = [...ids, body.add];
      if (body.remove) ids = ids.filter((x) => x !== body.remove);
      return { ...p, name: body.name || p.name, track_ids: ids };
    });
    return { playlist: clone(playlists.find((p) => p.id === id)) };
  },
  async deletePlaylist(id) {
    playlists = playlists.filter((p) => p.id !== id);
    return { ok: true };
  },
  async generate(body) {
    await wait(500);
    const tags = body.tags || [];
    const description = [tags.join(', '), (body.prompt || '').trim()].filter(Boolean).join('. ');
    if (body.mode !== 'instrumental' && (body.lyrics || '').trim().length < 10)
      throw new Error('Song mode needs lyrics (at least 10 characters). Switch to Beat for a track with no vocals.');
    if (description.length < 3) throw new Error('Describe the beat or pick at least one style tag.');
    const id = `g${Date.now()}`;
    const title = (body.title || '').trim() || (body.prompt || tags.join(' ') || 'Untitled Session').trim().slice(0, 60);
    const lower = tags.join(' ').toLowerCase();
    const style = /trap|drill/.test(lower) ? 'trap' : 'rnb';
    const bpm = style === 'trap' ? 140 : /house|afro|amapiano/.test(lower) ? 118 : /lo-fi|chill/.test(lower) ? 74 : 86;
    jobs.set(id, {
      startedAt: Date.now(),
      track: {
        id,
        title,
        artist: 'Dré Smoove',
        source: 'ai',
        tags,
        prompt: description,
        lyrics: body.mode === 'instrumental' ? null : body.lyrics,
        model: body.mode === 'instrumental' ? 'meta/musicgen' : 'minimax/music-1.5',
        format: 'wav',
        artwork_url: null,
        release_date: null,
        created_at: new Date().toISOString(),
      },
      render: renderBeat({
        seed: id + description,
        seconds: body.mode === 'instrumental' ? Math.min(20, body.duration || 15) : 16,
        bpm,
        root: 52 + Math.floor(Math.random() * 10),
        style,
        vocal: body.mode !== 'instrumental',
      }),
    });
    return { id, status: 'starting', title };
  },
  async pollGeneration(id) {
    const job = jobs.get(id);
    if (!job) throw new Error('Generation not found.');
    const age = Date.now() - job.startedAt;
    if (age < 3000) return { status: 'starting' };
    if (age < 9000) return { status: 'processing' };
    const url = await job.render;
    const track = { ...job.track, url, duration: null, peaks: null };
    if (!tracks.find((t) => t.id === id)) tracks = [track, ...tracks];
    jobs.delete(id);
    return { status: 'succeeded', track };
  },
};

export const previewReady = boot;
