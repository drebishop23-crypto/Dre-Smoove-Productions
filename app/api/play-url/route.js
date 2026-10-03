import { jsonError } from '@/lib/supabase-admin';
import { playUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';

// GET /api/play-url?path=… — fresh playback link for a stored audio file (Studio clips, stems)
export async function GET(req) {
  try {
    const path = new URL(req.url).searchParams.get('path');
    if (!path || !/^(uploads|ai|edits|stems|tmp|studio|voices)\//.test(path)) return jsonError('Unknown file.');
    return Response.json({ url: await playUrl(path) });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
