import { admin, BUCKETS, withUrls, jsonError } from '@/lib/supabase-admin';
import { deleteObject } from '@/lib/r2';
import { lyricLines } from '@/lib/lyrics';

export const dynamic = 'force-dynamic';

// Covers and edited versions share their song's artwork, so only delete the file when nothing else uses it.
async function removeArtworkIfUnused(sb, path, exceptId) {
  const { count } = await sb.from('sp_tracks').select('id', { count: 'exact', head: true }).eq('artwork_path', path).neq('id', exceptId);
  if (!count) await sb.storage.from(BUCKETS.artwork).remove([path]);
}

const EDITABLE = [
  'title', 'artist', 'tags', 'release_date', 'artwork_path', 'peaks', 'duration', 'lyrics',
  'video_path', 'spotify_url', 'apple_music_url', 'soundcloud_url', 'youtube_url', 'lyrics_synced',
  'is_public', 'pinned', 'allow_remixes', 'allow_comments', 'liked', 'disliked', 'workspace_id', 'instrumental',
  'audio_path', 'format',
];

// GET /api/tracks/:id — one song, plus its versions
export async function GET(_req, { params }) {
  try {
    const sb = admin();
    const { data, error } = await sb.from('sp_tracks').select('*').eq('id', params.id).single();
    if (error || !data) return jsonError('Song not found.', 404);
    const [track] = await withUrls(sb, [data]);
    return Response.json({ track });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// POST /api/tracks/:id { restore: true } — bring a song back from Trash
export async function POST(req, { params }) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.restore) return jsonError('Unknown action.');
    const sb = admin();
    const { data, error } = await sb.from('sp_tracks').update({ deleted_at: null }).eq('id', params.id).select().single();
    if (error) throw error;
    const [track] = await withUrls(sb, [data]);
    return Response.json({ track });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

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

    if ('workspace_id' in patch && !patch.workspace_id) patch.workspace_id = null;

    // Swapping the audio file (e.g. converted to WAV): only accept files in your own storage, remove the old one after
    let oldAudio = null;
    if ('audio_path' in patch) {
      if (!/^(uploads|ai|edits|studio)\//.test(patch.audio_path || '')) return jsonError('Unknown audio file.');
      const { data: cur } = await sb.from('sp_tracks').select('audio_path').eq('id', params.id).single();
      if (cur?.audio_path && cur.audio_path !== patch.audio_path) oldAudio = cur.audio_path;
    }

    // Remove the old artwork file when a new one replaces it (unless another version still uses it)
    if (patch.artwork_path) {
      const { data: old } = await sb.from('sp_tracks').select('artwork_path').eq('id', params.id).single();
      if (old?.artwork_path && old.artwork_path !== patch.artwork_path) {
        await removeArtworkIfUnused(sb, old.artwork_path, params.id);
      }
    }

    const { data, error } = await sb.from('sp_tracks').update(patch).eq('id', params.id).select().single();
    if (error) throw error;
    if (oldAudio) await deleteObject(oldAudio).catch(() => {});
    const [track] = await withUrls(sb, [data]);
    return Response.json({ track });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// DELETE /api/tracks/:id — move to Trash
// DELETE /api/tracks/:id?forever=1 — delete the row and its files for good (only from Trash)
export async function DELETE(req, { params }) {
  try {
    const sb = admin();
    const forever = new URL(req.url).searchParams.get('forever');
    const { data: row, error } = await sb.from('sp_tracks').select('*').eq('id', params.id).single();
    if (error) throw error;
    if (!forever) {
      const { error: upErr } = await sb.from('sp_tracks').update({ deleted_at: new Date().toISOString() }).eq('id', params.id);
      if (upErr) throw upErr;
      return Response.json({ ok: true, trashed: true });
    }
    if (!row.deleted_at) return jsonError('Move the song to Trash first.');
    await deleteObject(row.audio_path).catch(() => {});
    if (row.video_path) await deleteObject(row.video_path).catch(() => {});
    for (const path of Object.values(row.stems || {})) await deleteObject(path).catch(() => {});
    if (row.midi_path) await deleteObject(row.midi_path).catch(() => {});
    if (row.artwork_path) await removeArtworkIfUnused(sb, row.artwork_path, params.id);
    const { error: delErr } = await sb.from('sp_tracks').delete().eq('id', params.id);
    if (delErr) throw delErr;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
