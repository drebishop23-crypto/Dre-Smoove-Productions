import { admin, signArtwork, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const EDITABLE = [
  'display_name', 'handle', 'bio', 'avatar_path', 'banner_path', 'genres',
  'soundcloud_url', 'youtube_url', 'spotify_url', 'apple_music_url', 'instagram_url',
];

async function load(sb) {
  const { data, error } = await sb.from('sp_profile').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  const profile = data || { id: 1, display_name: 'Dré Smoove', handle: 'dresmoove', genres: [], profile_views: 0 };
  const { data: stats } = await sb.from('sp_tracks').select('plays, likes');
  const songs = stats?.length || 0;
  const plays = (stats || []).reduce((s, r) => s + (r.plays || 0), 0);
  const likes = (stats || []).reduce((s, r) => s + (r.likes || 0), 0);
  return {
    ...profile,
    avatar_url: await signArtwork(sb, profile.avatar_path),
    banner_url: await signArtwork(sb, profile.banner_path),
    stats: { songs, plays, likes, views: profile.profile_views || 0 },
  };
}

// GET /api/profile[?view=1]
export async function GET(req) {
  try {
    const sb = admin();
    if (new URL(req.url).searchParams.get('view')) {
      const { data } = await sb.from('sp_profile').select('profile_views').eq('id', 1).maybeSingle();
      if (data) await sb.from('sp_profile').update({ profile_views: (data.profile_views || 0) + 1 }).eq('id', 1);
    }
    return Response.json({ profile: await load(sb) });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// PATCH /api/profile
export async function PATCH(req) {
  try {
    const body = await req.json();
    const patch = { updated_at: new Date().toISOString() };
    for (const k of EDITABLE) if (k in body) patch[k] = body[k];
    for (const k of ['soundcloud_url', 'youtube_url', 'spotify_url', 'apple_music_url', 'instagram_url', 'bio']) {
      if (k in patch) patch[k] = (patch[k] || '').trim() || null;
    }
    if ('handle' in patch) patch.handle = (patch.handle || 'dresmoove').replace(/^@/, '').trim();
    const sb = admin();
    const { error } = await sb.from('sp_profile').upsert({ id: 1, ...patch });
    if (error) throw error;
    return Response.json({ profile: await load(sb) });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
