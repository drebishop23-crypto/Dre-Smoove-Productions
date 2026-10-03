import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const patch = {};
    if ('liked' in body) patch.liked = !!body.liked;
    if ('title' in body) patch.title = (body.title || '').slice(0, 120) || null;
    const { data, error } = await admin().from('sp_hooks').update(patch).eq('id', params.id).select().single();
    if (error) throw error;
    return Response.json({ hook: data });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { error } = await admin().from('sp_hooks').delete().eq('id', params.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
