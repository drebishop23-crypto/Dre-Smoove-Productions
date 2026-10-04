import { admin, withUrls, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// GET /api/history — songs you played most recently (newest first, each song once)
export async function GET() {
  try {
    const sb = admin();
    const { data, error } = await sb.from('sp_plays').select('track_id, played_at').order('played_at', { ascending: false }).limit(300);
    if (error) throw error;
    const seen = new Map();
    for (const r of data || []) if (!seen.has(r.track_id)) seen.set(r.track_id, r.played_at);
    const ids = [...seen.keys()].slice(0, 100);
    if (!ids.length) return Response.json({ history: [] });
    let { data: rows, error: tErr } = await sb.from('sp_tracks').select('*').in('id', ids).is('deleted_at', null);
    if (tErr) ({ data: rows, error: tErr } = await sb.from('sp_tracks').select('*').in('id', ids));
    if (tErr) throw tErr;
    const tracks = await withUrls(sb, rows || []);
    const byId = Object.fromEntries(tracks.map((t) => [t.id, t]));
    return Response.json({
      history: ids.filter((id) => byId[id]).map((id) => ({ ...byId[id], played_at: seen.get(id) })),
    });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
