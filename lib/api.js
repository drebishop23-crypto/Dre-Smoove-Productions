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
  const { bucket: bucketId, path, token } = await send('POST', '/api/upload-url', { bucket, filename: file.name });
  const { error } = await supabaseBrowser()
    .storage.from(bucketId)
    .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
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
};
