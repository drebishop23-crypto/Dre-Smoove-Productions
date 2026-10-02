import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await admin()
      .from('sp_playlists')
      .select('id, name, created_at, sp_playlist_tracks(track_id, position)')
      .order('created_at', { ascending: true })
      .order('position', { referencedTable: 'sp_playlist_tracks', ascending: true });
    if (error) throw error;
    const playlists = (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      created_at: p.created_at,
      track_ids: (p.sp_playlist_tracks || []).map((t) => t.track_id),
    }));
    return Response.json({ playlists });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

export async function POST(req) {
  try {
    const { name } = await req.json();
    if (!name?.trim()) return jsonError('Give the playlist a name.');
    const { data, error } = await admin()
      .from('sp_playlists')
      .insert({ name: name.trim().slice(0, 120) })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ playlist: { ...data, track_ids: [] } });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
