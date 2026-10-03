'use client';
// Browser-side uploads to YouTube and SoundCloud, plus the DistroKid release kit.
import JSZip from 'jszip';
import { api } from '@/lib/api';
import { downloadBlob, safeFilename } from '@/lib/audio';

function xhrSend({ method, url, headers = {}, body, onProgress }) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      let data = null;
      try {
        data = JSON.parse(x.responseText);
      } catch {}
      if (x.status >= 200 && x.status < 300) resolve({ data, xhr: x });
      else reject(new Error(data?.error?.message || data?.errors?.[0]?.error_message || `Upload failed (${x.status})`));
    };
    x.onerror = () => reject(new Error('Network error during upload.'));
    x.send(body);
  });
}

async function fetchBlob(url, what = 'file') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the ${what} (${res.status}).`);
  return res.blob();
}

// ---------- YouTube ----------
export async function uploadToYouTube({ track, title, description, privacy = 'private', onProgress }) {
  if (!track.video_url) throw new Error('Make a music video for this song first.');
  const { access_token } = await api.platformToken('youtube');
  onProgress?.(0, 'Loading the video');
  const video = await fetchBlob(track.video_url, 'video');

  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(video.size),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify({
      snippet: { title: title.slice(0, 100), description, tags: track.tags || [], categoryId: '10' },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) {
    const d = await init.json().catch(() => ({}));
    throw new Error(d.error?.message || `YouTube refused the upload (${init.status}).`);
  }
  const location = init.headers.get('Location');
  if (!location) throw new Error('YouTube did not return an upload address.');

  const { data } = await xhrSend({
    method: 'PUT',
    url: location,
    headers: { 'Content-Type': 'video/mp4' },
    body: video,
    onProgress: (p) => onProgress?.(p, 'Uploading to YouTube'),
  });
  const url = `https://www.youtube.com/watch?v=${data.id}`;
  await api.updateTrack(track.id, { youtube_url: url }).catch(() => {});
  return url;
}

// ---------- SoundCloud ----------
export async function uploadToSoundCloud({ track, title, description, sharing = 'private', onProgress }) {
  const { access_token } = await api.platformToken('soundcloud');
  onProgress?.(0, 'Loading the song');
  const audio = await fetchBlob(track.url, 'song');
  const form = new FormData();
  form.append('track[title]', title);
  form.append('track[artist]', track.artist || 'Dré Smoove');
  form.append('track[sharing]', sharing);
  if (description) form.append('track[description]', description);
  if (track.tags?.length) {
    form.append('track[genre]', track.tags[0]);
    form.append('track[tag_list]', track.tags.map((t) => (t.includes(' ') ? `"${t}"` : t)).join(' '));
  }
  form.append('track[asset_data]', audio, `${safeFilename(title)}.${track.format || 'wav'}`);
  if (track.artwork_url) {
    const art = await fetchBlob(track.artwork_url, 'artwork').catch(() => null);
    if (art) form.append('track[artwork_data]', art, 'artwork.png');
  }
  const { data } = await xhrSend({
    method: 'POST',
    url: 'https://api.soundcloud.com/tracks',
    headers: { Authorization: `OAuth ${access_token}`, Accept: 'application/json; charset=utf-8' },
    body: form,
    onProgress: (p) => onProgress?.(p, 'Uploading to SoundCloud'),
  });
  const url = data?.permalink_url || null;
  if (url) await api.updateTrack(track.id, { soundcloud_url: url }).catch(() => {});
  return url;
}

// ---------- DistroKid / Spotify / Apple Music release kit ----------
async function cover3000(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 3000;
  c.height = 3000;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 3000, 3000);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
}

export async function buildReleaseKit(track, { songwriter = 'Dré Bishop', onProgress } = {}) {
  const zip = new JSZip();
  const base = safeFilename(track.title);
  onProgress?.('Adding the song');
  zip.file(`${base}.${track.format || 'wav'}`, await fetchBlob(track.url, 'song'));
  if (track.artwork_url) {
    onProgress?.('Sizing the cover to 3000 x 3000');
    const cover = await cover3000(track.artwork_url).catch(() => null);
    if (cover) zip.file(`${base} - cover 3000x3000.jpg`, cover);
  }
  if (track.lyrics) zip.file(`${base} - lyrics.txt`, track.lyrics);
  const info = [
    `Song title: ${track.title}`,
    `Artist: ${track.artist || 'Dré Smoove'}`,
    `Songwriter: ${songwriter}`,
    `Genre: ${(track.tags || [])[0] || ''}`,
    `Tags: ${(track.tags || []).join(', ')}`,
    `Release date: ${track.release_date || 'not set'}`,
    `Audio file: ${base}.${track.format || 'wav'}`,
    track.source === 'ai' ? 'Made with AI: yes (declare this in DistroKid)' : '',
    '',
    'DistroKid upload page: https://distrokid.com/new/',
  ].filter((l) => l !== '').join('\n');
  zip.file(`${base} - release info.txt`, info);
  onProgress?.('Packing the zip');
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${base} - release kit.zip`);
}
