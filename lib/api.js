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

// PUT with upload progress (fetch can't report progress)
function putWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload to storage failed (${xhr.status}). Check the R2 CORS setting.`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check your internet connection and try again.'));
    xhr.send(file);
  });
}

async function pushToStorage(bucket, file, onProgress) {
  const contentType = file.type || 'application/octet-stream';
  const target = await send('POST', '/api/upload-url', { bucket, filename: file.name, contentType });

  // Songs: straight to Cloudflare R2 with a one-time signed URL
  if (target.store === 'r2') {
    await putWithProgress(target.url, file, contentType, onProgress);
    return target.path;
  }

  // Artwork: Supabase Storage
  const { error } = await supabaseBrowser()
    .storage.from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, file, { contentType });
  if (error) throw new Error(error.message);
  return target.path;
}

// Last results, so pages show your songs instantly and refresh quietly in the background
const memo = {};
function remember(key, promise) {
  return promise.then((r) => {
    memo[key] = r;
    try {
      sessionStorage.setItem(`sp-cache-${key}`, JSON.stringify(r));
    } catch {}
    return r;
  });
}
function peek(key) {
  if (memo[key]) return memo[key];
  try {
    const raw = sessionStorage.getItem(`sp-cache-${key}`);
    if (raw) return (memo[key] = JSON.parse(raw));
  } catch {}
  return null;
}

export const api = {
  peek,
  // Tracks
  listTracks: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    const req = fetch(`/api/tracks${qs ? `?${qs}` : ''}`, { cache: 'no-store' }).then(handle);
    return qs ? req : remember('tracks', req);
  },
  updateTrack: (id, patch) => send('PATCH', `/api/tracks/${id}`, patch),
  deleteTrack: (id) => send('DELETE', `/api/tracks/${id}`), // moves to Trash
  restoreTrack: (id) => send('POST', `/api/tracks/${id}`, { restore: true }),
  deleteForever: (id) => send('DELETE', `/api/tracks/${id}?forever=1`),

  getTrack: (id) => fetch(`/api/tracks/${id}`, { cache: 'no-store' }).then(handle),

  async uploadTrack(file, meta = {}, onProgress) {
    const audio_path = await pushToStorage('audio', file, onProgress);
    return send('POST', '/api/tracks', { ...meta, audio_path, format: extOf(file.name) });
  },

  // Upload any audio file (voice sample, a cut section) and get its storage path back
  uploadAudio: (file) => pushToStorage('audio', file),
  playUrl: (path) => fetch(`/api/play-url?path=${encodeURIComponent(path)}`).then(handle),

  async uploadArtwork(trackId, file) {
    const artwork_path = await pushToStorage('artwork', file);
    return send('PATCH', `/api/tracks/${trackId}`, { artwork_path });
  },

  // Playlists
  listPlaylists: () => remember('playlists', fetch('/api/playlists', { cache: 'no-store' }).then(handle)),
  createPlaylist: (name) => send('POST', '/api/playlists', { name }),
  updatePlaylist: (id, body) => send('PATCH', `/api/playlists/${id}`, body),
  deletePlaylist: (id) => send('DELETE', `/api/playlists/${id}`),

  // AI generation (songs, covers, remixes, stems, extend…)
  generate: (body) => send('POST', '/api/generate', body),
  pollGeneration: (id) => fetch(`/api/generate/${id}`, { cache: 'no-store' }).then(handle),

  // Runs a job and waits for it to finish. onStatus gets progress text.
  async runJob(body, onStatus, { every = 4000, maxMinutes = 15 } = {}) {
    const job = await send('POST', '/api/generate', body);
    const until = Date.now() + maxMinutes * 60000;
    let fails = 0;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, every));
      let res;
      try {
        res = await fetch(`/api/generate/${job.id}`, { cache: 'no-store' }).then(handle);
        fails = 0;
      } catch (e) {
        if (++fails >= 4) throw e;
        continue;
      }
      if (res.status === 'succeeded') return res;
      if (res.status === 'failed' || res.status === 'canceled') throw new Error(res.error || 'The AI could not finish this one.');
      onStatus?.(res.progress || (res.status === 'processing' ? 'Working on it' : 'Warming up the AI'));
    }
    throw new Error('That took too long. Check the Library in a few minutes.');
  },

  // AI lyric writer
  async writeLyrics(idea) {
    let res = await send('POST', '/api/lyrics', { idea });
    for (let i = 0; i < 40 && res.status !== 'succeeded'; i++) {
      if (res.status === 'failed' || res.status === 'canceled') throw new Error(res.error || 'The lyric writer could not finish.');
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetch(`/api/lyrics?id=${encodeURIComponent(res.id)}`, { cache: 'no-store' }).then(handle);
    }
    if (res.status !== 'succeeded') throw new Error('The lyric writer took too long. Try again.');
    return res;
  },

  // Workspaces
  listWorkspaces: () => remember('workspaces', fetch('/api/workspaces', { cache: 'no-store' }).then(handle)),
  createWorkspace: (name) => send('POST', '/api/workspaces', { name }),
  renameWorkspace: (id, name) => send('PATCH', `/api/workspaces/${id}`, { name }),
  deleteWorkspace: (id) => send('DELETE', `/api/workspaces/${id}`),

  // Studio projects
  listProjects: () => remember('projects', fetch('/api/projects', { cache: 'no-store' }).then(handle)),
  createProject: (body) => send('POST', '/api/projects', body),
  getProject: (id) => fetch(`/api/projects/${id}`, { cache: 'no-store' }).then(handle),
  saveProject: (id, body) => send('PATCH', `/api/projects/${id}`, body),
  deleteProject: (id) => send('DELETE', `/api/projects/${id}`),

  // Hooks
  listHooks: () => fetch('/api/hooks', { cache: 'no-store' }).then(handle),
  createHook: (body) => send('POST', '/api/hooks', body),
  updateHook: (id, body) => send('PATCH', `/api/hooks/${id}`, body),
  deleteHook: (id) => send('DELETE', `/api/hooks/${id}`),

  // Comments and history
  listComments: (trackId) => fetch(`/api/tracks/${trackId}/comments`, { cache: 'no-store' }).then(handle),
  addComment: (trackId, body) => send('POST', `/api/tracks/${trackId}/comments`, body),
  deleteComment: (id) => send('DELETE', `/api/comments/${id}`),
  history: () => fetch('/api/history', { cache: 'no-store' }).then(handle),

  // Synced lyrics
  startLyricSync: (id) => send('POST', `/api/tracks/${id}/sync-lyrics`),
  pollLyricSync: (id, pid) => fetch(`/api/tracks/${id}/sync-lyrics?pid=${encodeURIComponent(pid)}`).then(handle),

  // Plays and likes
  trackStat: (id, action) => send('POST', `/api/tracks/${id}/stats`, { action }),

  // Profile
  getProfile: (countView = false) => remember('profile', fetch(`/api/profile${countView ? '?view=1' : ''}`, { cache: 'no-store' }).then(handle)),
  updateProfile: (patch) => send('PATCH', '/api/profile', patch),
  async uploadProfileImage(file, field = 'avatar_path') {
    const path = await pushToStorage('artwork', file);
    return send('PATCH', '/api/profile', { [field]: path });
  },

  // AI covers
  startCovers: (prompt, image_path, target) => send('POST', '/api/covers', { prompt, image_path, target }),
  uploadImage: (file) => pushToStorage('artwork', file),
  pollCovers: (id) => fetch(`/api/covers/${id}`).then(handle),
  saveCover: (body) => send('POST', '/api/covers/save', body),

  // AI videos
  latestVideoJob: (trackId) => fetch(`/api/videos?track_id=${encodeURIComponent(trackId)}`).then(handle),
  startVideo: (body) => send('POST', '/api/videos', body),
  pollVideo: (id) => fetch(`/api/videos/${id}`).then(handle),
  retryVideo: (id) => send('POST', `/api/videos/${id}`, { retry: true }),
  async saveVideo(trackId, blob, onProgress) {
    const file = blob instanceof File ? blob : new File([blob], 'music-video.mp4', { type: 'video/mp4' });
    const video_path = await pushToStorage('video', file, onProgress);
    return send('PATCH', `/api/tracks/${trackId}`, { video_path });
  },

  // Platform connections
  connections: () => fetch('/api/connect', { cache: 'no-store' }).then(handle),
  disconnect: (service) => send('DELETE', `/api/connect/${service}`),
  platformToken: (service) => fetch(`/api/connect/${service}/token`).then(handle),
};
