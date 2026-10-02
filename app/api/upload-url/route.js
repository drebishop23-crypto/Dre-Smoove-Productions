import { admin, BUCKETS, jsonError } from '@/lib/supabase-admin';
import { uploadUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';

// POST /api/upload-url { bucket: 'audio' | 'artwork', filename, contentType }
// Songs go to Cloudflare R2 (no size cap). Artwork goes to Supabase Storage.
// Either way the browser uploads directly, so big WAV files never pass
// through a serverless function.
export async function POST(req) {
  try {
    const { bucket, filename = 'file', contentType } = await req.json();
    if (!['audio', 'artwork'].includes(bucket)) return jsonError('Unknown bucket.');
    const clean = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-80);

    if (bucket === 'audio') {
      const path = `uploads/${crypto.randomUUID()}-${clean}`;
      const url = await uploadUrl(path, contentType);
      return Response.json({ store: 'r2', path, url });
    }

    const path = `art/${crypto.randomUUID()}-${clean}`;
    const { data, error } = await admin().storage.from(BUCKETS.artwork).createSignedUploadUrl(path);
    if (error) throw error;
    return Response.json({ store: 'supabase', bucket: BUCKETS.artwork, path: data.path, token: data.token });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
