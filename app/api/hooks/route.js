import { admin, withUrls, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sb = admin();
    const { data, error } = await sb.from('sp_hooks').select('*, sp_tracks(*)').order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data || []).filter((h) => h.sp_tracks);
    const tracks = await withUrls(sb, rows.map((h) => h.sp_tracks));
    return Response.json({
      hooks: rows.map(({ sp_tracks, ...h }, i) => ({ ...h, track: tracks[i] })),
    });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

export async function POST(req) {
  try {
    const { track_id, start_sec, end_sec, title } = await req.json();
    const start = Math.max(0, Number(start_sec) || 0);
    const end = Number(end_sec) > start ? Number(end_sec) : start + 15;
    if (!track_id) return jsonError('Pick a song.');
    if (end - start > 60) return jsonError('Hooks can be up to 60 seconds.');
    const { data, error } = await admin()
      .from('sp_hooks')
      .insert({ track_id, start_sec: start, end_sec: end, title: (title || '').slice(0, 120) || null })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ hook: data });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
