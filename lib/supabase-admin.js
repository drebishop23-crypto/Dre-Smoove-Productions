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

// When the artwork bucket is public, covers get permanent links the browser and the
// image CDN can cache, so pages load much faster. Checked once per server start.
let artworkPublic = null;
async function isArtworkPublic(sb) {
  if (artworkPublic !== null) return artworkPublic;
  try {
    const { data } = await sb.storage.getBucket(BUCKETS.artwork);
    artworkPublic = !!data?.public;
  } catch {
    artworkPublic = false;
  }
  return artworkPublic;
}

async function signPaths(sb, bucket, paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  if (bucket === BUCKETS.artwork && (await isArtworkPublic(sb))) {
    return Object.fromEntries(unique.map((p) => [p, sb.storage.from(bucket).getPublicUrl(p).data.publicUrl]));
  }
  const { data, error } = await sb.storage.from(bucket).createSignedUrls(unique, SIGN_SECONDS);
  if (error) throw error;
  const map = {};
  for (const row of data || []) if (row.signedUrl) map[row.path] = row.signedUrl;
  return map;
}

// Attach short-lived playback URLs for audio + artwork.
export async function withUrls(sb, rows) {
  const [audioUrls, art, videoUrls, extras] = await Promise.all([
    Promise.all(rows.map((r) => (r.audio_path ? playUrl(r.audio_path).catch(() => null) : null))),
    signPaths(sb, BUCKETS.artwork, rows.map((r) => r.artwork_path)),
    Promise.all(rows.map((r) => (r.video_path ? playUrl(r.video_path).catch(() => null) : null))),
    Promise.all(
    rows.map(async (r) => {
      const out = {};
      if (r.stems && typeof r.stems === 'object') {
        const entries = await Promise.all(
          Object.entries(r.stems).map(async ([k, path]) => [k, await playUrl(path).catch(() => null)])
        );
        out.stems_urls = Object.fromEntries(entries.filter(([, u]) => u));
      }
      if (r.midi_path) out.midi_url = await playUrl(r.midi_path).catch(() => null);
      return out;
    })
    ),
  ]);
  return rows.map((r, i) => ({
    ...r,
    ...extras[i],
    url: audioUrls[i] || null,
    video_url: videoUrls[i] || null,
    artwork_url: r.artwork_path ? art[r.artwork_path] || null : null,
  }));
}

export async function signArtwork(sb, path) {
  if (!path) return null;
  if (await isArtworkPublic(sb)) return sb.storage.from(BUCKETS.artwork).getPublicUrl(path).data.publicUrl;
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
