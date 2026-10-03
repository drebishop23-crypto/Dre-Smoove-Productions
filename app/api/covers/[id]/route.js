import { jsonError } from '@/lib/supabase-admin';
import { getPrediction } from '@/lib/replicate';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  try {
    const p = await getPrediction(params.id);
    const out = Array.isArray(p.output) ? p.output.filter(Boolean) : p.output ? [p.output] : [];
    return Response.json({ status: p.status, images: p.status === 'succeeded' ? out : [], error: p.error || null });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
