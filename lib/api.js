// Client-side API layer. Every component talks to the backend through this file.
import { supabaseBrowser } from '@/lib/supabase-browser';

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function send(method, url, body) {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(handle);
}

function extOf(name = '') {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : 'mp3';
}

async function pushToStorage(bucket, file) {
  const contentType = file.type || 'application/octet-stream';
  const target = await send('POST', '/api/upload-url', { bucket, filename: file.name, contentType });

  // Songs: straight to Cloudflare R2 with a one-time signed URL
  if (target.store === 'r2') {
    const res = await fetch(target.url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
    if (!res.ok) throw new Error(`Upload to storage failed (${res.status}). Check the R2 CORS setting.`);
    return target.path;
  }

  // Artwork: Supabase Storage
  const { error } = await supabaseBrowser()
    .storage.from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, file, { contentType });
  if (error) throw new Error(error.message);
  return target.path;
}

export const api = {
  // Tracks
  listTracks: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return fetch(`/api/tracks${qs ? `?${qs}` : ''}`).then(handle);
  },
  updateTrack: (id, patch) => send('PATCH', `/api/tracks/${id}`, patch),
  deleteTrack: (id) => send('DELETE', `/api/tracks/${id}`),

  async uploadTrack(file, meta = {}) {
    const audio_path = await pushToStorage('audio', file);
    return send('POST', '/api/tracks', { ...meta, audio_path, format: extOf(file.name) });
  },

  async uploadArtwork(trackId, file) {
    const artwork_path = await pushToStorage('artwork', file);
    return send('PATCH', `/api/tracks/${trackId}`, { artwork_path });
  },

  // Playlists
  listPlaylists: () => fetch('/api/playlists').then(handle),
  createPlaylist: (name) => send('POST', '/api/playlists', { name }),
  updatePlaylist: (id, body) => send('PATCH', `/api/playlists/${id}`, body),
  deletePlaylist: (id) => send('DELETE', `/api/playlists/${id}`),

  // AI generation
  generate: (body) => send('POST', '/api/generate', body),
  pollGeneration: (id) => fetch(`/api/generate/${id}`).then(handle),

  // Synced lyrics
  startLyricSync: (id) => send('POST', `/api/tracks/${id}/sync-lyrics`),
  pollLyricSync: (id, pid) => fetch(`/api/tracks/${id}/sync-lyrics?pid=${encodeURIComponent(pid)}`).then(handle),

  // Plays and likes
  trackStat: (id, action) => send('POST', `/api/tracks/${id}/stats`, { action }),

  // Profile
  getProfile: (countView = false) => fetch(`/api/profile${countView ? '?view=1' : ''}`).then(handle),
  updateProfile: (patch) => send('PATCH', '/api/profile', patch),
  async uploadProfileImage(file, field = 'avatar_path') {
    const path = await pushToStorage('artwork', file);
    return send('PATCH', '/api/profile', { [field]: path });
  },

  // AI covers
  startCovers: (prompt) => send('POST', '/api/covers', { prompt }),
  pollCovers: (id) => fetch(`/api/covers/${id}`).then(handle),
  saveCover: (body) => send('POST', '/api/covers/save', body),

  // AI videos
  latestVideoJob: (trackId) => fetch(`/api/videos?track_id=${encodeURIComponent(trackId)}`).then(handle),
  startVideo: (body) => send('POST', '/api/videos', body),
  pollVideo: (id) => fetch(`/api/videos/${id}`).then(handle),
  retryVideo: (id) => send('POST', `/api/videos/${id}`, { retry: true }),
  async saveVideo(trackId, blob) {
    const file = new File([blob], 'music-video.mp4', { type: 'video/mp4' });
    const video_path = await pushToStorage('video', file);
    return send('PATCH', `/api/tracks/${trackId}`, { video_path });
  },

  // Platform connections
  connections: () => fetch('/api/connect').then(handle),
  disconnect: (service) => send('DELETE', `/api/connect/${service}`),
  platformToken: (service) => fetch(`/api/connect/${service}/token`).then(handle),
};
