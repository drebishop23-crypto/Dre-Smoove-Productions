import { createClient } from '@supabase/supabase-js';
import { playUrl } from '@/lib/r2';

// Server-only client. Uses the service role key, which never reaches the browser.
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured. Add the Supabase keys to your environment variables.');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Tables and buckets are prefixed with sp_ / sp- so they can share a Supabase
// project with other sites without colliding. Song files live in Cloudflare R2
// (see lib/r2.js); only artwork uses Supabase Storage.
export const BUCKETS = { artwork: 'sp-artwork' };

const SIGN_SECONDS = 60 * 60 * 12;

async function signPaths(sb, bucket, paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await sb.storage.from(bucket).createSignedUrls(unique, SIGN_SECONDS);
  if (error) throw error;
  const map = {};
  for (const row of data || []) if (row.signedUrl) map[row.path] = row.signedUrl;
  return map;
}

// Attach short-lived playback URLs for audio + artwork.
export async function withUrls(sb, rows) {
  const [audioUrls, art] = await Promise.all([
    Promise.all(rows.map((r) => (r.audio_path ? playUrl(r.audio_path).catch(() => null) : null))),
    signPaths(sb, BUCKETS.artwork, rows.map((r) => r.artwork_path)),
  ]);
  const videoUrls = await Promise.all(
    rows.map((r) => (r.video_path ? playUrl(r.video_path).catch(() => null) : null))
  );
  return rows.map((r, i) => ({
    ...r,
    url: audioUrls[i] || null,
    video_url: videoUrls[i] || null,
    artwork_url: r.artwork_path ? art[r.artwork_path] || null : null,
  }));
}

export async function signArtwork(sb, path) {
  if (!path) return null;
  const { data } = await sb.storage.from(BUCKETS.artwork).createSignedUrl(path, SIGN_SECONDS);
  return data?.signedUrl || null;
}

// Copy a remote image (e.g. a Replicate output) into the artwork bucket.
export async function saveRemoteImage(sb, url, prefix = 'art') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image (${res.status}).`);
  const type = res.headers.get('content-type') || 'image/png';
  const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png';
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from(BUCKETS.artwork)
    .upload(path, new Uint8Array(await res.arrayBuffer()), { contentType: type });
  if (error) throw error;
  return path;
}

export function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}
