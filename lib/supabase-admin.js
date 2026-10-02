import { createClient } from '@supabase/supabase-js';

// Server-only client. Uses the service role key, which never reaches the browser.
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured. Add the Supabase keys to your environment variables.');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Storage buckets and tables are prefixed with sp_ / sp- so they can share a
// Supabase project with other sites without colliding.
export const BUCKETS = { audio: 'sp-audio', artwork: 'sp-artwork' };

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
  const [audio, art] = await Promise.all([
    signPaths(sb, BUCKETS.audio, rows.map((r) => r.audio_path)),
    signPaths(sb, BUCKETS.artwork, rows.map((r) => r.artwork_path)),
  ]);
  return rows.map((r) => ({
    ...r,
    url: audio[r.audio_path] || null,
    artwork_url: r.artwork_path ? art[r.artwork_path] || null : null,
  }));
}

export function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}
