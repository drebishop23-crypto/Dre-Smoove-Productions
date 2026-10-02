import { admin, BUCKETS, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// POST /api/upload-url { bucket: 'audio' | 'artwork', filename }
// Returns a one-time signed upload token so the browser can send large files
// straight to Supabase Storage without passing through a serverless function.
export async function POST(req) {
  try {
    const { bucket, filename = 'file' } = await req.json();
    if (!['audio', 'artwork'].includes(bucket)) return jsonError('Unknown bucket.');
    const clean = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-80);
    const folder = bucket === 'audio' ? 'uploads' : 'art';
    const path = `${folder}/${crypto.randomUUID()}-${clean}`;
    const { data, error } = await admin().storage.from(BUCKETS[bucket]).createSignedUploadUrl(path);
    if (error) throw error;
    return Response.json({ bucket: BUCKETS[bucket], path: data.path, token: data.token });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
