import { admin, signArtwork, jsonError } from '@/lib/supabase-admin';
import { startCovers, startPhotoCover } from '@/lib/replicate';

export const dynamic = 'force-dynamic';

function images(p) {
  const out = p.output;
  return Array.isArray(out) ? out.filter(Boolean) : out ? [out] : [];
}

// POST /api/covers { prompt, image_path? }
// Without a photo: 4 AI cover options. With your photo: 2 AI covers built from it.
export async function POST(req) {
  try {
    const { prompt, image_path, target } = await req.json();

    if (image_path) {
      const url = await signArtwork(admin(), image_path);
      if (!url) return jsonError('Could not read that photo. Upload it again.');
      const style = (prompt || '').trim() || 'a professional music album cover';
      const shape = target === 'banner' ? 'wide banner image' : 'square album cover';
      const aspect = target === 'banner' ? '21:9' : '1:1';
      const full = `Turn this photo into ${style}. Keep the person's face and identity exactly the same. ${shape}, professional lighting, high detail, no text, no words, no letters.`;
      const preds = await Promise.all([startPhotoCover(full, url, aspect), startPhotoCover(`${full} Try a different composition.`, url, aspect)]);
      return Response.json({
        ids: preds.map((p) => p.id),
        images: preds.filter((p) => p.status === 'succeeded').flatMap(images),
        pending: preds.filter((p) => p.status !== 'succeeded').map((p) => p.id),
      });
    }

    if (!prompt || prompt.trim().length < 3) return jsonError('Describe the cover you want.');
    const full = `${prompt.trim()}. Square album cover art, professional, high detail, no text, no words, no letters.`;
    const p = await startCovers(full, 4);
    return Response.json({ id: p.id, status: p.status, images: p.status === 'succeeded' ? images(p) : [] });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
