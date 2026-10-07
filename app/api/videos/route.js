import { admin, jsonError } from '@/lib/supabase-admin';
import { CLIP_SECONDS } from '@/lib/replicate';
import { deleteObject } from '@/lib/r2';

export const dynamic = 'force-dynamic';

const MAX_CLIPS = 150;

// GET /api/videos?track_id=… — latest video job for a track
export async function GET(req) {
  try {
    const trackId = new URL(req.url).searchParams.get('track_id');
    if (!trackId) return jsonError('track_id is required.');
    const { data, error } = await admin()
      .from('sp_video_jobs')
      .select('*')
      .eq('track_id', trackId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return Response.json({ job: data?.[0] || null });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// POST /api/videos { track_id, look, scenes: string[] }
// Creates a job with one ~5s clip per scene. Clips are started gradually by GET /api/videos/:id.
export async function POST(req) {
  try {
    const { track_id, look = '', scenes = [] } = await req.json();
    if (!track_id) return jsonError('track_id is required.');
    const list = scenes.map((s) => String(s || '').trim()).filter(Boolean).slice(0, MAX_CLIPS);
    if (!list.length) return jsonError('Add at least one scene.');

    const sb = admin();
    const { data: track, error: tErr } = await sb.from('sp_tracks').select('id, title, tags').eq('id', track_id).single();
    if (tErr) throw tErr;

    const { data: job, error } = await sb
      .from('sp_video_jobs')
      .insert({ track_id, look, clip_count: list.length, status: 'generating' })
      .select()
      .single();
    if (error) throw error;

    const style = [look.trim(), (track.tags || []).join(', ')].filter(Boolean).join('. ');
    const rows = list.map((scene, idx) => ({
      job_id: job.id,
      idx,
      prompt: `Cinematic music video shot for the song "${track.title}". ${scene}. ${style}. Smooth camera movement, film lighting, no text.`.slice(0, 1500),
    }));
    for (let i = 0; i < rows.length; i += 50) {
      const { error: cErr } = await sb.from('sp_video_clips').insert(rows.slice(i, i + 50));
      if (cErr) throw cErr;
    }
    return Response.json({ job, clip_seconds: CLIP_SECONDS });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// DELETE /api/videos?track_id=… — delete the song's music video and every AI clip made for it
export async function DELETE(req) {
  try {
    const trackId = new URL(req.url).searchParams.get('track_id');
    if (!trackId) return jsonError('track_id is required.');
    const sb = admin();
    const { data: track, error } = await sb.from('sp_tracks').select('id, video_path').eq('id', trackId).single();
    if (error || !track) return jsonError('Song not found.', 404);

    const { data: jobs } = await sb.from('sp_video_jobs').select('id').eq('track_id', trackId);
    const jobIds = (jobs || []).map((j) => j.id);
    if (jobIds.length) {
      const { data: clips } = await sb.from('sp_video_clips').select('r2_path').in('job_id', jobIds);
      await Promise.all((clips || []).filter((c) => c.r2_path).map((c) => deleteObject(c.r2_path).catch(() => {})));
      await sb.from('sp_video_jobs').delete().in('id', jobIds); // clips go with them
    }

    if (track.video_path) {
      const { error: upErr } = await sb.from('sp_tracks').update({ video_path: null }).eq('id', trackId);
      if (upErr) throw upErr;
      await deleteObject(track.video_path).catch(() => {});
    }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
