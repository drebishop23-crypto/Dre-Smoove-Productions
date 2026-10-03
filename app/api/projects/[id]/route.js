import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  try {
    const { data, error } = await admin().from('sp_projects').select('*').eq('id', params.id).single();
    if (error || !data) return jsonError('Project not found.', 404);
    return Response.json({ project: data });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const patch = { updated_at: new Date().toISOString() };
    if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 120) || 'Untitled project';
    if (body.data && typeof body.data === 'object') patch.data = body.data;
    const { data, error } = await admin().from('sp_projects').update(patch).eq('id', params.id).select().single();
    if (error) throw error;
    return Response.json({ project: data });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { error } = await admin().from('sp_projects').delete().eq('id', params.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
