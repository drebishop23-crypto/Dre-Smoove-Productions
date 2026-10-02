import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// PATCH /api/playlists/:id { name?, add?: trackId, remove?: trackId }
export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const sb = admin();
    const id = params.id;

    if (body.name?.trim()) {
      const { error } = await sb.from('sp_playlists').update({ name: body.name.trim().slice(0, 120) }).eq('id', id);
      if (error) throw error;
    }

    if (body.add) {
      const { data: last } = await sb
        .from('sp_playlist_tracks')
        .select('position')
        .eq('playlist_id', id)
        .order('position', { ascending: false })
        .limit(1);
      const position = (last?.[0]?.position ?? -1) + 1;
      const { error } = await sb
        .from('sp_playlist_tracks')
        .upsert({ playlist_id: id, track_id: body.add, position }, { onConflict: 'playlist_id,track_id', ignoreDuplicates: true });
      if (error) throw error;
    }

    if (body.remove) {
      const { error } = await sb.from('sp_playlist_tracks').delete().eq('playlist_id', id).eq('track_id', body.remove);
      if (error) throw error;
    }

    const { data, error } = await sb
      .from('sp_playlists')
      .select('id, name, created_at, sp_playlist_tracks(track_id, position)')
      .eq('id', id)
      .order('position', { referencedTable: 'sp_playlist_tracks', ascending: true })
      .single();
    if (error) throw error;
    return Response.json({
      playlist: {
        id: data.id,
        name: data.name,
        created_at: data.created_at,
        track_ids: (data.sp_playlist_tracks || []).map((t) => t.track_id),
      },
    });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { error } = await admin().from('sp_playlists').delete().eq('id', params.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
