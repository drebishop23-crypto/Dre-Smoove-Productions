import { admin, BUCKETS, withUrls, saveRemoteImage, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// Covers can be shared by a song's versions, so only delete the old file when nothing else uses it.
async function removeIfUnused(sb, path) {
  if (!path) return;
  const { count } = await sb.from('sp_tracks').select('id', { count: 'exact', head: true }).eq('artwork_path', path);
  const { data: prof } = await sb.from('sp_profile').select('avatar_path, banner_path').eq('id', 1).maybeSingle();
  if (!count && prof?.avatar_path !== path && prof?.banner_path !== path) await sb.storage.from(BUCKETS.artwork).remove([path]);
}

// POST /api/covers/save { url | path, target: 'track' | 'avatar' | 'banner', track_id? }
// url: an AI image to copy in. path: a photo you already uploaded.
export async function POST(req) {
  try {
    const { url, path: uploaded, target = 'track', track_id } = await req.json();
    const sb = admin();
    let path;
    if (uploaded) {
      if (!/^(art|profile)\//.test(uploaded)) return jsonError('Unknown image.');
      path = uploaded;
    } else {
      if (!url || !/^https:\/\/([a-z0-9-]+\.)*replicate\.(delivery|com)\//.test(url)) return jsonError('Unknown image source.');
      path = await saveRemoteImage(sb, url, target === 'track' ? 'art' : 'profile');
    }

    if (target === 'track') {
      if (!track_id) return jsonError('track_id is required.');
      const { data: old } = await sb.from('sp_tracks').select('artwork_path').eq('id', track_id).single();
      const { data, error } = await sb.from('sp_tracks').update({ artwork_path: path }).eq('id', track_id).select().single();
      if (error) throw error;
      if (old?.artwork_path && old.artwork_path !== path) await removeIfUnused(sb, old.artwork_path);
      const [track] = await withUrls(sb, [data]);
      return Response.json({ track });
    }

    const field = target === 'banner' ? 'banner_path' : 'avatar_path';
    const { error } = await sb.from('sp_profile').upsert({ id: 1, [field]: path, updated_at: new Date().toISOString() });
    if (error) throw error;
    return Response.json({ path });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
