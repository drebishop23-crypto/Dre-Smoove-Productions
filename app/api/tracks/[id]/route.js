import { admin, BUCKETS, withUrls, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const EDITABLE = ['title', 'artist', 'tags', 'release_date', 'artwork_path', 'peaks', 'duration'];

// PATCH /api/tracks/:id — update metadata
export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const patch = {};
    for (const k of EDITABLE) if (k in body) patch[k] = body[k];
    if ('release_date' in patch && !patch.release_date) patch.release_date = null;
    if (!Object.keys(patch).length) return jsonError('Nothing to update.');
    const sb = admin();

    // Remove the old artwork file when a new one replaces it
    if (patch.artwork_path) {
      const { data: old } = await sb.from('sp_tracks').select('artwork_path').eq('id', params.id).single();
      if (old?.artwork_path && old.artwork_path !== patch.artwork_path) {
        await sb.storage.from(BUCKETS.artwork).remove([old.artwork_path]);
      }
    }

    const { data, error } = await sb.from('sp_tracks').update(patch).eq('id', params.id).select().single();
    if (error) throw error;
    const [track] = await withUrls(sb, [data]);
    return Response.json({ track });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// DELETE /api/tracks/:id — remove the row and its files
export async function DELETE(_req, { params }) {
  try {
    const sb = admin();
    const { data: row, error } = await sb.from('sp_tracks').select('*').eq('id', params.id).single();
    if (error) throw error;
    await sb.storage.from(BUCKETS.audio).remove([row.audio_path]);
    if (row.artwork_path) await sb.storage.from(BUCKETS.artwork).remove([row.artwork_path]);
    const { error: delErr } = await sb.from('sp_tracks').delete().eq('id', params.id);
    if (delErr) throw delErr;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
