import { admin, withUrls, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// GET /api/tracks?source=ai|upload&playlist=<id>&workspace=<id>&trash=1
export async function GET(req) {
  try {
    const sb = admin();
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source');
    const playlist = searchParams.get('playlist');
    const workspace = searchParams.get('workspace');
    const trash = searchParams.get('trash');

    if (playlist) {
      const { data, error } = await sb
        .from('sp_playlist_tracks')
        .select('position, sp_tracks(*)')
        .eq('playlist_id', playlist)
        .order('position', { ascending: true });
      if (error) throw error;
      const rows = (data || []).map((r) => r.sp_tracks).filter((t) => t && !t.deleted_at);
      return Response.json({ tracks: await withUrls(sb, rows) });
    }

    // Trash shows only deleted songs; everything else hides them
    let q = trash
      ? sb.from('sp_tracks').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
      : sb.from('sp_tracks').select('*').is('deleted_at', null).order('created_at', { ascending: false });
    if (source === 'ai' || source === 'upload') q = q.eq('source', source);
    if (workspace) q = q.eq('workspace_id', workspace);
    let { data, error } = await q;
    // Before the Trash update is run in Supabase there is no deleted_at column yet
    if (error && /deleted_at/.test(error.message)) {
      if (trash) return Response.json({ tracks: [], needsUpdate: true });
      ({ data, error } = await sb.from('sp_tracks').select('*').order('created_at', { ascending: false }));
    }
    if (error) throw error;
    return Response.json({ tracks: await withUrls(sb, data || []) });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// POST /api/tracks — register a file that was just uploaded (a recording, or an edited version of a song)
export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.audio_path) return jsonError('audio_path is required.');
    const sb = admin();
    const row = {
      title: (body.title || 'Untitled').slice(0, 200),
      artist: body.artist || 'Dré Smoove',
      source: ['upload', 'ai', 'edit', 'studio'].includes(body.source) ? body.source : 'upload',
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
      release_date: body.release_date || null,
      audio_path: body.audio_path,
      format: body.format || null,
      duration: body.duration || null,
      peaks: body.peaks || null,
    };
    for (const k of ['parent_id', 'edit_note', 'lyrics', 'prompt', 'model', 'artwork_path', 'workspace_id']) {
      if (body[k]) row[k] = body[k];
    }
    if ('instrumental' in body) row.instrumental = !!body.instrumental;
    const { data, error } = await sb.from('sp_tracks').insert(row).select().single();
    if (error) throw error;
    const [track] = await withUrls(sb, [data]);
    return Response.json({ track });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
