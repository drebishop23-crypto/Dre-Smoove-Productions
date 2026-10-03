import { admin, jsonError } from '@/lib/supabase-admin';
import { playUrl } from '@/lib/r2';
import {
  LIMITS,
  startSong,
  startInstrumental,
  startCover,
  startReference,
  startContinuation,
  startStems,
  startMidi,
} from '@/lib/replicate';

export const dynamic = 'force-dynamic';

const AUDIO_LINK_SECONDS = 60 * 60 * 6;

async function trackRow(sb, id) {
  const { data, error } = await sb.from('sp_tracks').select('*').eq('id', id).single();
  if (error || !data) throw new Error('That song could not be found.');
  return data;
}

async function audioLink(sb, { track_id, audio_path }) {
  if (audio_path) return playUrl(audio_path, AUDIO_LINK_SECONDS);
  if (track_id) return playUrl((await trackRow(sb, track_id)).audio_path, AUDIO_LINK_SECONDS);
  throw new Error('Pick a song first.');
}

const clean = (s, max) => String(s || '').trim().slice(0, max);
const tagList = (t) => (Array.isArray(t) ? t : String(t || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);

// POST /api/generate
// kind: song | instrumental | cover | mashup | inspiration | voice | sample | extend | replace | stems | midi
export async function POST(req) {
  try {
    const body = await req.json();
    const kind = body.kind || body.mode || 'song';
    const sb = admin();
    const prompt = clean(body.prompt, LIMITS.prompt);
    const lyrics = clean(body.lyrics, LIMITS.lyrics);
    const tags = tagList(body.tags);
    let parent = body.track_id ? await trackRow(sb, body.track_id) : null;
    let prediction;
    let title = clean(body.title, 200);

    switch (kind) {
      case 'song': {
        const instrumental = !!body.instrumental;
        if (prompt.length < 3) return jsonError('Describe the song or pick a few styles first.');
        prediction = await startSong({ prompt, lyrics, instrumental });
        title ||= lyrics.match(/^title:\s*(.+)$/im)?.[1]?.trim() || prompt.slice(0, 60);
        break;
      }
      case 'instrumental': {
        if (prompt.length < 3) return jsonError('Describe the beat or pick at least one style.');
        const duration = Math.min(30, Math.max(5, Number(body.duration) || 20));
        prediction = await startInstrumental({ prompt, duration });
        title ||= prompt.slice(0, 60);
        break;
      }
      case 'cover':
      case 'mashup': {
        if (!parent && !body.audio_path) return jsonError('Pick the song to remix.');
        if (prompt.length < 3) return jsonError('Describe the new style for this version.');
        prediction = await startCover({ audioUrl: await audioLink(sb, body), prompt, lyrics: clean(body.lyrics, LIMITS.coverLyrics) });
        title ||= `${parent?.title || 'Song'} (${kind === 'mashup' ? 'Mashup' : 'Cover'})`;
        break;
      }
      case 'inspiration':
      case 'voice': {
        if (kind === 'voice' && !body.voice_path) return jsonError('Upload or record a voice sample first.');
        if (kind === 'inspiration' && !parent) return jsonError('Pick the song to use as inspiration.');
        const refLyrics = clean(body.lyrics, LIMITS.refLyrics);
        if (refLyrics.length < 10) return jsonError('Add a few lines of lyrics (up to 350 characters for this mode).');
        prediction = await startReference({
          songUrl: parent ? await playUrl(parent.audio_path, AUDIO_LINK_SECONDS) : null,
          voiceUrl: body.voice_path ? await playUrl(body.voice_path, AUDIO_LINK_SECONDS) : null,
          lyrics: refLyrics,
        });
        title ||= `${parent?.title || 'New song'} (${kind === 'voice' ? 'My Voice' : 'Inspired'})`;
        break;
      }
      case 'sample': {
        if (!parent && !body.audio_path) return jsonError('Pick the song to sample.');
        const start = Number(body.start) || 0;
        const end = Number(body.end) > start ? Number(body.end) : start + 10;
        prediction = await startContinuation({
          audioUrl: await audioLink(sb, body),
          prompt: prompt || (parent?.tags || []).join(', ') || 'new beat built on this sample',
          duration: Math.max(15, Number(body.duration) || 30),
          start,
          end,
        });
        title ||= `${parent?.title || 'Sample'} (Sampled)`;
        break;
      }
      case 'extend': {
        // The editor sends the last few seconds of the song as audio_path; otherwise use the saved song
        if (!parent && !body.audio_path) return jsonError('Pick the song to extend.');
        const dur = Number(parent?.duration) || 0;
        const from = body.audio_path ? 0 : Math.max(0, (Number(body.from) || dur) - 10);
        prediction = await startContinuation({
          audioUrl: await audioLink(sb, body),
          prompt: prompt || parent?.prompt || (parent?.tags || []).join(', ') || 'continue the song in the same style',
          duration: Math.min(30, 10 + Math.max(5, Number(body.seconds) || 20)),
          start: from,
          end: -1,
        });
        break;
      }
      case 'replace': {
        if (!body.audio_path) return jsonError('Select the part of the song to replace.');
        if (prompt.length < 3) return jsonError('Describe the style for the new section.');
        prediction = await startCover({ audioUrl: await audioLink(sb, { audio_path: body.audio_path }), prompt, lyrics: clean(body.lyrics, LIMITS.coverLyrics) });
        break;
      }
      case 'stems': {
        if (!parent) return jsonError('Pick the song to split.');
        prediction = await startStems(await playUrl(parent.audio_path, AUDIO_LINK_SECONDS));
        break;
      }
      case 'midi': {
        if (!parent) return jsonError('Pick the song.');
        const source = body.stem && parent.stems?.[body.stem] ? parent.stems[body.stem] : parent.audio_path;
        prediction = await startMidi(await playUrl(source, AUDIO_LINK_SECONDS));
        break;
      }
      default:
        return jsonError('Unknown job type.');
    }

    const { error } = await sb.from('sp_generations').insert({
      id: prediction.id,
      provider: prediction.model,
      kind,
      mode: kind,
      title: title || null,
      tags,
      prompt: prompt || null,
      lyrics: lyrics || null,
      status: prediction.status,
      parent_id: parent?.id || null,
      workspace_id: body.workspace_id || null,
      params: {
        instrumental: !!body.instrumental || kind === 'instrumental',
        start: body.start ?? null,
        end: body.end ?? null,
        stem: body.stem ?? null,
        artwork_path: kind === 'cover' || kind === 'mashup' ? parent?.artwork_path || null : null,
      },
    });
    if (error) throw error;

    return Response.json({ id: prediction.id, status: prediction.status, title: title || parent?.title || 'Working', kind });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
