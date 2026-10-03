import { jsonError } from '@/lib/supabase-admin';
import { accessToken } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// GET /api/connect/:service/token — short-lived token so the browser can upload
// large files straight to YouTube / SoundCloud.
export async function GET(_req, { params }) {
  try {
    return Response.json({ access_token: await accessToken(params.service) });
  } catch (e) {
    return jsonError(e.message, 400);
  }
}
