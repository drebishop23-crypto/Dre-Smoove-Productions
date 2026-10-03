import { admin, BUCKETS, withUrls, saveRemoteImage, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// POST /api/covers/save { url, target: 'track' | 'avatar' | 'banner', track_id? }
export async function POST(req) {
  try {
    const { url, target = 'track', track_id } = await req.json();
    if (!url || !/^https:\/\/([a-z0-9-]+\.)*replicate\.(delivery|com)\//.test(url)) return jsonError('Unknown image source.');
    const sb = admin();
    const path = await saveRemoteImage(sb, url, target === 'track' ? 'art' : 'profile');

    if (target === 'track') {
      if (!track_id) return jsonError('track_id is required.');
      const { data: old } = await sb.from('sp_tracks').select('artwork_path').eq('id', track_id).single();
      const { data, error } = await sb.from('sp_tracks').update({ artwork_path: path }).eq('id', track_id).select().single();
      if (error) throw error;
      if (old?.artwork_path) await sb.storage.from(BUCKETS.artwork).remove([old.artwork_path]);
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
