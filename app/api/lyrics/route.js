import { jsonError } from '@/lib/supabase-admin';
import { startLyrics, getPrediction } from '@/lib/replicate';

export const dynamic = 'force-dynamic';
export const maxDuration = 26;

function textOf(output) {
  const raw = Array.isArray(output) ? output.join('') : String(output || '');
  const text = raw.trim();
  const title = text.match(/^\s*title:\s*(.+)$/im)?.[1]?.replace(/["*]/g, '').trim() || '';
  const lyrics = text.replace(/^\s*title:.*$/im, '').replace(/\*\*/g, '').trim();
  return { title, lyrics };
}

function reply(p) {
  if (p.status === 'succeeded') return Response.json({ status: 'succeeded', ...textOf(p.output) });
  if (p.status === 'failed' || p.status === 'canceled') return Response.json({ status: p.status, error: p.error || 'The lyric writer could not finish.' });
  return Response.json({ status: p.status, id: p.id });
}

// POST /api/lyrics { idea } — write lyrics with AI
export async function POST(req) {
  try {
    const { idea } = await req.json();
    if (!idea || String(idea).trim().length < 3) return jsonError('Say what the song is about first.');
    return reply(await startLyrics(String(idea).slice(0, 1500)));
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// GET /api/lyrics?id=… — check on lyrics that were still being written
export async function GET(req) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return jsonError('id is required.');
    return reply(await getPrediction(id));
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
