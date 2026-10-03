import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// POST /api/tracks/:id/stats { action: 'play' | 'like' | 'unlike' }
export async function POST(req, { params }) {
  try {
    const { action } = await req.json();
    const sb = admin();
    const { data: row, error } = await sb.from('sp_tracks').select('plays, likes').eq('id', params.id).single();
    if (error) throw error;
    const patch = {};
    if (action === 'play') patch.plays = (row.plays || 0) + 1;
    else if (action === 'like') patch.likes = (row.likes || 0) + 1;
    else if (action === 'unlike') patch.likes = Math.max(0, (row.likes || 0) - 1);
    else return jsonError('Unknown action.');
    const { error: upErr } = await sb.from('sp_tracks').update(patch).eq('id', params.id);
    if (upErr) throw upErr;
    return Response.json({ plays: patch.plays ?? row.plays, likes: patch.likes ?? row.likes });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
