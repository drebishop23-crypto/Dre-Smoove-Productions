import { admin, jsonError } from '@/lib/supabase-admin';
import { startSong, startInstrumental } from '@/lib/replicate';

export const dynamic = 'force-dynamic';

// POST /api/generate
// { mode: 'song' | 'instrumental', title, tags: string[], prompt, lyrics, duration }
export async function POST(req) {
  try {
    const body = await req.json();
    const mode = body.mode === 'instrumental' ? 'instrumental' : 'song';
    const tags = Array.isArray(body.tags) ? body.tags.slice(0, 12) : [];
    const description = [tags.join(', '), (body.prompt || '').trim()].filter(Boolean).join('. ');
    const lyrics = (body.lyrics || '').trim();

    let prediction;
    if (mode === 'song') {
      if (description.length < 10) return jsonError('Add a few style tags or a longer description (at least 10 characters).');
      if (lyrics.length < 10) return jsonError('Song mode needs lyrics (at least 10 characters). Switch to Instrumental for a beat with no vocals.');
      if (lyrics.length > 600) return jsonError('Lyrics are limited to 600 characters for this model.');
      prediction = await startSong({ prompt: description.slice(0, 300), lyrics });
    } else {
      if (description.length < 3) return jsonError('Describe the beat or pick at least one style tag.');
      const duration = Math.min(30, Math.max(5, Number(body.duration) || 15));
      prediction = await startInstrumental({ prompt: description.slice(0, 1000), duration });
    }

    const title =
      (body.title || '').trim().slice(0, 200) ||
      (body.prompt || tags.join(' ') || 'Untitled Session').trim().slice(0, 60);

    const { error } = await admin().from('sp_generations').insert({
      id: prediction.id,
      provider: prediction.model,
      mode,
      title,
      tags,
      prompt: description,
      lyrics: mode === 'song' ? lyrics : null,
      status: prediction.status,
    });
    if (error) throw error;

    return Response.json({ id: prediction.id, status: prediction.status, title });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
