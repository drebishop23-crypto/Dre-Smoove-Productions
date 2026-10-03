import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  try {
    const { data, error } = await admin().from('sp_comments').select('*').eq('track_id', params.id).order('created_at', { ascending: true });
    if (error) throw error;
    return Response.json({ comments: data || [] });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

export async function POST(req, { params }) {
  try {
    const { name, body } = await req.json();
    const text = String(body || '').trim();
    if (!text) return jsonError('Write a comment first.');
    const sb = admin();
    const { data: track } = await sb.from('sp_tracks').select('allow_comments').eq('id', params.id).single();
    if (!track) return jsonError('Song not found.', 404);
    if (track.allow_comments === false) return jsonError('Comments are turned off for this song.', 403);
    const { data, error } = await sb
      .from('sp_comments')
      .insert({ track_id: params.id, name: String(name || '').trim().slice(0, 60) || 'Guest', body: text.slice(0, 1000) })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ comment: data });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
