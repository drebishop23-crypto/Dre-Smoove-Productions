import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// POST /api/tracks/:id/stats { action: 'play' | 'like' | 'unlike' | 'dislike' | 'undislike' }
export async function POST(req, { params }) {
  try {
    const { action } = await req.json();
    const sb = admin();
    const { data: row, error } = await sb.from('sp_tracks').select('plays, likes, liked, disliked').eq('id', params.id).single();
    if (error) throw error;
    const patch = {};
    if (action === 'play') {
      patch.plays = (row.plays || 0) + 1;
      await sb.from('sp_plays').insert({ track_id: params.id }).then(() => {}, () => {});
    } else if (action === 'like') {
      if (!row.liked) patch.likes = (row.likes || 0) + 1;
      patch.liked = true;
      patch.disliked = false;
    } else if (action === 'unlike') {
      if (row.liked) patch.likes = Math.max(0, (row.likes || 0) - 1);
      patch.liked = false;
    } else if (action === 'dislike') {
      if (row.liked) patch.likes = Math.max(0, (row.likes || 0) - 1);
      patch.liked = false;
      patch.disliked = true;
    } else if (action === 'undislike') {
      patch.disliked = false;
    } else return jsonError('Unknown action.');
    const { data, error: upErr } = await sb.from('sp_tracks').update(patch).eq('id', params.id).select('plays, likes, liked, disliked').single();
    if (upErr) throw upErr;
    return Response.json(data);
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
