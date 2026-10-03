import { jsonError } from '@/lib/supabase-admin';
import { startCovers } from '@/lib/replicate';

export const dynamic = 'force-dynamic';

function images(p) {
  const out = p.output;
  return Array.isArray(out) ? out.filter(Boolean) : out ? [out] : [];
}

// POST /api/covers { prompt } — start 4 AI cover options
export async function POST(req) {
  try {
    const { prompt } = await req.json();
    if (!prompt || prompt.trim().length < 3) return jsonError('Describe the cover you want.');
    const full = `${prompt.trim()}. Square album cover art, professional, high detail, no text, no words, no letters.`;
    const p = await startCovers(full, 4);
    return Response.json({ id: p.id, status: p.status, images: p.status === 'succeeded' ? images(p) : [] });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
