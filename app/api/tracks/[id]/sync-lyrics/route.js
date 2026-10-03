import { admin, withUrls, jsonError } from '@/lib/supabase-admin';
import { playUrl } from '@/lib/r2';
import { startTranscription, getPrediction, transcriptWords } from '@/lib/replicate';
import { lyricLines, alignLyrics } from '@/lib/lyrics';

export const dynamic = 'force-dynamic';

// POST /api/tracks/:id/sync-lyrics — start AI listening (Whisper) on the song
export async function POST(_req, { params }) {
  try {
    const sb = admin();
    const { data: track, error } = await sb.from('sp_tracks').select('*').eq('id', params.id).single();
    if (error) throw error;
    if (!lyricLines(track.lyrics).length) return jsonError('Add the lyrics to this song first.');
    const audio = await playUrl(track.audio_path, 60 * 60 * 3);
    const p = await startTranscription(audio);
    return Response.json({ id: p.id, status: p.status });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// GET /api/tracks/:id/sync-lyrics?pid=… — when listening is done, line up the lyrics and save
export async function GET(req, { params }) {
  try {
    const pid = new URL(req.url).searchParams.get('pid');
    if (!pid) return jsonError('pid is required.');
    const p = await getPrediction(pid);
    if (p.status === 'failed' || p.status === 'canceled') {
      return Response.json({ status: p.status, error: p.error || 'The AI could not listen to this song.' });
    }
    if (p.status !== 'succeeded') return Response.json({ status: p.status });

    const sb = admin();
    const { data: track, error } = await sb.from('sp_tracks').select('*').eq('id', params.id).single();
    if (error) throw error;
    const words = transcriptWords(p.output);
    if (!words.length) return Response.json({ status: 'failed', error: 'No singing was detected in this song.' });
    const synced = alignLyrics(lyricLines(track.lyrics), words, Number(track.duration) || 0);
    const { data, error: upErr } = await sb.from('sp_tracks').update({ lyrics_synced: synced }).eq('id', params.id).select().single();
    if (upErr) throw upErr;
    const [saved] = await withUrls(sb, [data]);
    return Response.json({ status: 'succeeded', track: saved });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
