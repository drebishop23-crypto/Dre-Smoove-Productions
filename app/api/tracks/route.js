import { admin, withUrls, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// GET /api/tracks?source=ai|upload&playlist=<id>
export async function GET(req) {
  try {
    const sb = admin();
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source');
    const playlist = searchParams.get('playlist');

    if (playlist) {
      const { data, error } = await sb
        .from('sp_playlist_tracks')
        .select('position, sp_tracks(*)')
        .eq('playlist_id', playlist)
        .order('position', { ascending: true });
      if (error) throw error;
      const rows = (data || []).map((r) => r.sp_tracks).filter(Boolean);
      return Response.json({ tracks: await withUrls(sb, rows) });
    }

    let q = sb.from('sp_tracks').select('*').order('created_at', { ascending: false });
    if (source === 'ai' || source === 'upload') q = q.eq('source', source);
    const { data, error } = await q;
    if (error) throw error;
    return Response.json({ tracks: await withUrls(sb, data || []) });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// POST /api/tracks — register a file that was just uploaded to the audio bucket
export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.audio_path) return jsonError('audio_path is required.');
    const sb = admin();
    const row = {
      title: (body.title || 'Untitled').slice(0, 200),
      artist: body.artist || 'Dré Smoove',
      source: 'upload',
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
      release_date: body.release_date || null,
      audio_path: body.audio_path,
      format: body.format || null,
      duration: body.duration || null,
      peaks: body.peaks || null,
    };
    const { data, error } = await sb.from('sp_tracks').insert(row).select().single();
    if (error) throw error;
    const [track] = await withUrls(sb, [data]);
    return Response.json({ track });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
