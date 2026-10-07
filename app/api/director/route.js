import { jsonError } from '@/lib/supabase-admin';
import { startDirector, getPrediction } from '@/lib/replicate';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

function parse(output, want) {
  const text = (Array.isArray(output) ? output.join('') : String(output || '')).replace(/\*\*/g, '');
  const look = text.match(/^\s*LOOK:\s*(.+)$/im)?.[1]?.trim() || '';
  const scenes = [];
  for (const m of text.matchAll(/^\s*(\d+)[.)]\s+(.+)$/gm)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= want) scenes[n - 1] = m[2].trim();
  }
  return { look, scenes };
}

function reply(p, want) {
  if (p.status === 'succeeded') {
    const { look, scenes } = parse(p.output, want);
    if (scenes.filter(Boolean).length < Math.min(3, want)) {
      return Response.json({ status: 'failed', error: 'The director did not return a shot list. Try again.' });
    }
    return Response.json({ status: 'succeeded', look, scenes });
  }
  if (p.status === 'failed' || p.status === 'canceled') return Response.json({ status: p.status, error: p.error || 'The director could not finish.' });
  return Response.json({ status: p.status, id: p.id });
}

// POST /api/director { title, tags, bpm, duration, segments, notes } — plan a shot list from the song
export async function POST(req) {
  try {
    const body = await req.json();
    const segments = Array.isArray(body.segments) ? body.segments.slice(0, 90) : [];
    if (!segments.length) return jsonError('Nothing to plan yet.');
    const p = await startDirector({ ...body, segments });
    return reply(p, segments.length);
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// GET /api/director?id=…&n=… — check on a plan still being written
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return jsonError('id is required.');
    return reply(await getPrediction(id), Number(searchParams.get('n')) || 60);
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
