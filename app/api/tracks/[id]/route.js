import { admin, BUCKETS, withUrls, jsonError } from '@/lib/supabase-admin';
import { deleteObject } from '@/lib/r2';
import { lyricLines } from '@/lib/lyrics';

export const dynamic = 'force-dynamic';

const EDITABLE = [
  'title', 'artist', 'tags', 'release_date', 'artwork_path', 'peaks', 'duration', 'lyrics',
  'video_path', 'spotify_url', 'apple_music_url', 'soundcloud_url', 'youtube_url', 'lyrics_synced',
];

// PATCH /api/tracks/:id — update metadata
export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const patch = {};
    for (const k of EDITABLE) if (k in body) patch[k] = body[k];
    if ('release_date' in patch && !patch.release_date) patch.release_date = null;
    for (const k of ['spotify_url', 'apple_music_url', 'soundcloud_url', 'youtube_url']) {
      if (k in patch) patch[k] = (patch[k] || '').trim() || null;
    }
    if (!Object.keys(patch).length) return jsonError('Nothing to update.');
    const sb = admin();

    // Keep synced timings when the lyrics change only in wording; clear them if lines were added or removed
    if ('lyrics' in patch && !('lyrics_synced' in patch)) {
      const { data: cur } = await sb.from('sp_tracks').select('lyrics_synced').eq('id', params.id).single();
      if (Array.isArray(cur?.lyrics_synced) && cur.lyrics_synced.length) {
        const lines = lyricLines(patch.lyrics || '');
        patch.lyrics_synced =
          lines.length === cur.lyrics_synced.length ? cur.lyrics_synced.map((l, i) => ({ ...l, text: lines[i] })) : null;
      }
    }

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
    await deleteObject(row.audio_path).catch(() => {});
    if (row.video_path) await deleteObject(row.video_path).catch(() => {});
    if (row.artwork_path) await sb.storage.from(BUCKETS.artwork).remove([row.artwork_path]);
    const { error: delErr } = await sb.from('sp_tracks').delete().eq('id', params.id);
    if (delErr) throw delErr;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
