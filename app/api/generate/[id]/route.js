import { admin, withUrls, jsonError } from '@/lib/supabase-admin';
import { getPrediction, outputUrl, outputUrls } from '@/lib/replicate';
import { putObject, playUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

const TRACK_KINDS = ['song', 'instrumental', 'cover', 'mashup', 'inspiration', 'voice', 'sample'];
const CLIP_KINDS = ['extend', 'replace'];

async function copyToR2(src, path) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not fetch the AI result (${res.status}).`);
  const type = res.headers.get('content-type') || 'audio/mpeg';
  await putObject(path, new Uint8Array(await res.arrayBuffer()), type);
  return type;
}

async function trackResponse(sb, id) {
  const { data: row } = await sb.from('sp_tracks').select('*').eq('id', id).single();
  const [track] = row ? await withUrls(sb, [row]) : [null];
  return track;
}

// GET /api/generate/:id — check a job. When it finishes, results are copied into
// your R2 storage (Replicate links expire) and saved.
export async function GET(_req, { params }) {
  try {
    const sb = admin();
    const { data: gen, error } = await sb.from('sp_generations').select('*').eq('id', params.id).single();
    if (error) return jsonError('Job not found.', 404);
    const kind = gen.kind || gen.mode || 'song';

    if (gen.track_id) return Response.json({ status: 'succeeded', kind, track: await trackResponse(sb, gen.track_id) });
    if (gen.status === 'succeeded' && CLIP_KINDS.includes(kind) && gen.result?.path) {
      return Response.json({ status: 'succeeded', kind, clip_url: await playUrl(gen.result.path, 3600) });
    }

    const p = await getPrediction(params.id);

    if (p.status === 'failed' || p.status === 'canceled') {
      await sb.from('sp_generations').update({ status: p.status, error: p.error || null }).eq('id', gen.id);
      return Response.json({ status: p.status, kind, error: p.error || 'The AI could not finish this one.' });
    }
    if (p.status !== 'succeeded') {
      if (p.status !== gen.status) await sb.from('sp_generations').update({ status: p.status }).eq('id', gen.id);
      return Response.json({ status: p.status, kind });
    }

    // ---- Stems: copy one file per check so each request stays quick ----
    if (kind === 'stems') {
      const outs = outputUrls(p.output);
      const wanted = Object.keys(outs).filter((k) => !k.startsWith('no_'));
      const done = { ...(gen.result?.stems || {}) };
      const next = wanted.find((k) => !done[k]);
      if (next) {
        const path = `stems/${gen.parent_id}/${next}.mp3`;
        await copyToR2(outs[next], path);
        done[next] = path;
        await sb.from('sp_generations').update({ result: { stems: done } }).eq('id', gen.id);
      }
      if (wanted.some((k) => !done[k])) {
        return Response.json({ status: 'processing', kind, progress: `${Object.keys(done).length} of ${wanted.length} stems saved` });
      }
      await sb.from('sp_tracks').update({ stems: done }).eq('id', gen.parent_id);
      await sb.from('sp_generations').update({ status: 'succeeded', track_id: gen.parent_id }).eq('id', gen.id);
      return Response.json({ status: 'succeeded', kind, track: await trackResponse(sb, gen.parent_id) });
    }

    const src = outputUrl(p.output);
    if (!src) throw new Error('The AI finished but returned nothing.');

    if (kind === 'midi') {
      const path = `midi/${gen.parent_id}${gen.params?.stem ? `-${gen.params.stem}` : ''}.mid`;
      await copyToR2(src, path);
      await sb.from('sp_tracks').update({ midi_path: path }).eq('id', gen.parent_id);
      await sb.from('sp_generations').update({ status: 'succeeded', track_id: gen.parent_id }).eq('id', gen.id);
      return Response.json({ status: 'succeeded', kind, track: await trackResponse(sb, gen.parent_id) });
    }

    if (CLIP_KINDS.includes(kind)) {
      const path = `tmp/${gen.id}.mp3`;
      await copyToR2(src, path);
      await sb.from('sp_generations').update({ status: 'succeeded', result: { path } }).eq('id', gen.id);
      return Response.json({ status: 'succeeded', kind, clip_url: await playUrl(path, 3600) });
    }

    if (!TRACK_KINDS.includes(kind)) throw new Error('Unknown job type.');

    const type = await copyToR2(src, `ai/${gen.id}.mp3`);
    const ext = type.includes('wav') ? 'wav' : 'mp3';
    const path = `ai/${gen.id}.mp3`;
    let parent = null;
    if (gen.parent_id) ({ data: parent } = await sb.from('sp_tracks').select('*').eq('id', gen.parent_id).single());

    const { data: row, error: insErr } = await sb
      .from('sp_tracks')
      .insert({
        title: gen.title || 'Untitled',
        artist: 'Dré Smoove',
        source: 'ai',
        tags: gen.tags || [],
        audio_path: path,
        format: ext,
        prompt: gen.prompt,
        lyrics: gen.lyrics,
        model: gen.provider,
        parent_id: gen.parent_id || null,
        workspace_id: gen.workspace_id || parent?.workspace_id || null,
        instrumental: !!gen.params?.instrumental,
        artwork_path: gen.params?.artwork_path || null,
        edit_note: kind === 'song' || kind === 'instrumental' ? null : kind,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    await sb.from('sp_generations').update({ status: 'succeeded', track_id: row.id }).eq('id', gen.id);
    const [track] = await withUrls(sb, [row]);
    return Response.json({ status: 'succeeded', kind, track });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
