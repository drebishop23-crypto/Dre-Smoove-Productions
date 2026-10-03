import { admin, jsonError } from '@/lib/supabase-admin';
import { startClip, getPrediction, outputUrl } from '@/lib/replicate';
import { putObject, playUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';

const MAX_RUNNING = 10;
const START_PER_CALL = 5;
const CHECK_PER_CALL = 10;
const COPY_PER_CALL = 3;
const BUDGET_MS = 7000;

const RUNNING = ['starting', 'processing'];

async function summary(sb, jobId) {
  const { data: job } = await sb.from('sp_video_jobs').select('*').eq('id', jobId).single();
  const { data: clips } = await sb
    .from('sp_video_clips')
    .select('idx, status, error, r2_path')
    .eq('job_id', jobId)
    .order('idx', { ascending: true });
  const counts = { pending: 0, running: 0, done: 0, failed: 0 };
  for (const c of clips || []) {
    if (c.status === 'done') counts.done++;
    else if (c.status === 'failed') counts.failed++;
    else if (c.status === 'pending') counts.pending++;
    else counts.running++;
  }
  const total = clips?.length || 0;
  const ready = total > 0 && counts.done === total;
  let urls = null;
  if (ready) urls = await Promise.all(clips.map((c) => playUrl(c.r2_path, 60 * 60 * 3)));
  return {
    job,
    total,
    counts,
    ready,
    clips: (clips || []).map((c) => ({ idx: c.idx, status: c.status, error: c.error })),
    clip_urls: urls,
  };
}

// GET /api/videos/:id — move the job forward a step and report progress.
export async function GET(_req, { params }) {
  const started = Date.now();
  const timeLeft = () => BUDGET_MS - (Date.now() - started);
  try {
    const sb = admin();
    const { data: clips, error } = await sb
      .from('sp_video_clips')
      .select('*')
      .eq('job_id', params.id)
      .order('idx', { ascending: true });
    if (error) throw error;

    // 1. Copy finished clips into R2 (Replicate links expire)
    const toCopy = clips.filter((c) => c.status === 'succeeded' && c.output_url).slice(0, COPY_PER_CALL);
    await Promise.all(
      toCopy.map(async (c) => {
        try {
          const res = await fetch(c.output_url);
          if (!res.ok) throw new Error(`Clip download failed (${res.status})`);
          const path = `videos/clips/${params.id}/${String(c.idx).padStart(4, '0')}.mp4`;
          await putObject(path, new Uint8Array(await res.arrayBuffer()), 'video/mp4');
          await sb.from('sp_video_clips').update({ status: 'done', r2_path: path }).eq('id', c.id);
        } catch (e) {
          await sb.from('sp_video_clips').update({ status: 'failed', error: e.message }).eq('id', c.id);
        }
      })
    );

    // 2. Check running clips
    if (timeLeft() > 2500) {
      const running = clips.filter((c) => RUNNING.includes(c.status) && c.prediction_id).slice(0, CHECK_PER_CALL);
      await Promise.all(
        running.map(async (c) => {
          try {
            const p = await getPrediction(c.prediction_id);
            if (p.status === 'succeeded') {
              await sb.from('sp_video_clips').update({ status: 'succeeded', output_url: outputUrl(p.output) }).eq('id', c.id);
            } else if (p.status === 'failed' || p.status === 'canceled') {
              await sb.from('sp_video_clips').update({ status: 'failed', error: p.error || p.status }).eq('id', c.id);
            } else if (p.status !== c.status) {
              await sb.from('sp_video_clips').update({ status: p.status }).eq('id', c.id);
            }
          } catch {}
        })
      );
    }

    // 3. Start more clips
    if (timeLeft() > 2500) {
      const runningCount = clips.filter((c) => RUNNING.includes(c.status)).length;
      const slots = Math.max(0, Math.min(START_PER_CALL, MAX_RUNNING - runningCount));
      const pending = clips.filter((c) => c.status === 'pending').slice(0, slots);
      await Promise.all(
        pending.map(async (c) => {
          try {
            const p = await startClip(c.prompt);
            await sb.from('sp_video_clips').update({ status: p.status || 'starting', prediction_id: p.id, error: null }).eq('id', c.id);
          } catch (e) {
            // Rate limits and temporary errors: leave it pending and try again next round
            await sb.from('sp_video_clips').update({ error: e.message }).eq('id', c.id);
          }
        })
      );
    }

    const s = await summary(sb, params.id);
    if (s.ready && s.job?.status !== 'clips_ready') {
      await sb.from('sp_video_jobs').update({ status: 'clips_ready' }).eq('id', params.id);
    }
    return Response.json(s);
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// POST /api/videos/:id { retry: true } — send failed clips back to the queue
export async function POST(req, { params }) {
  try {
    const { retry } = await req.json();
    if (!retry) return jsonError('Nothing to do.');
    const sb = admin();
    const { error } = await sb
      .from('sp_video_clips')
      .update({ status: 'pending', prediction_id: null, output_url: null, error: null })
      .eq('job_id', params.id)
      .eq('status', 'failed');
    if (error) throw error;
    return Response.json(await summary(sb, params.id));
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
