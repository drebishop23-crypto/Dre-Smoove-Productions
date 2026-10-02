import { admin, withUrls, jsonError } from '@/lib/supabase-admin';
import { getPrediction, outputUrl } from '@/lib/replicate';
import { putObject } from '@/lib/r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

// GET /api/generate/:id — check a generation. When it finishes, the audio is
// copied into your Supabase vault (Replicate links expire) and saved as a track.
export async function GET(_req, { params }) {
  try {
    const sb = admin();
    const { data: gen, error } = await sb.from('sp_generations').select('*').eq('id', params.id).single();
    if (error) return jsonError('Generation not found.', 404);

    if (gen.track_id) {
      const { data: row } = await sb.from('sp_tracks').select('*').eq('id', gen.track_id).single();
      const [track] = row ? await withUrls(sb, [row]) : [null];
      return Response.json({ status: 'succeeded', track });
    }

    const p = await getPrediction(params.id);

    if (p.status === 'failed' || p.status === 'canceled') {
      await sb.from('sp_generations').update({ status: p.status, error: p.error || null }).eq('id', gen.id);
      return Response.json({ status: p.status, error: p.error || 'The model could not finish this track.' });
    }

    if (p.status !== 'succeeded') {
      if (p.status !== gen.status) await sb.from('sp_generations').update({ status: p.status }).eq('id', gen.id);
      return Response.json({ status: p.status });
    }

    const src = outputUrl(p.output);
    if (!src) throw new Error('The model finished but returned no audio.');
    const audioRes = await fetch(src);
    if (!audioRes.ok) throw new Error(`Could not fetch generated audio (${audioRes.status}).`);
    const bytes = await audioRes.arrayBuffer();
    const type = audioRes.headers.get('content-type') || 'audio/mpeg';
    const ext = type.includes('wav') ? 'wav' : 'mp3';
    const path = `ai/${gen.id}.${ext}`;

    await putObject(path, new Uint8Array(bytes), type);

    const { data: row, error: insErr } = await sb
      .from('sp_tracks')
      .insert({
        title: gen.title,
        artist: 'Dré Smoove',
        source: 'ai',
        tags: gen.tags || [],
        audio_path: path,
        format: ext,
        prompt: gen.prompt,
        lyrics: gen.lyrics,
        model: gen.provider,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    await sb.from('sp_generations').update({ status: 'succeeded', track_id: row.id }).eq('id', gen.id);
    const [track] = await withUrls(sb, [row]);
    return Response.json({ status: 'succeeded', track });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
