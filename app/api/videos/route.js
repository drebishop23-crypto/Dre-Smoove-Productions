import { admin, jsonError } from '@/lib/supabase-admin';
import { CLIP_SECONDS } from '@/lib/replicate';

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
