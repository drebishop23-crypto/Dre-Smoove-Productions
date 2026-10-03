import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  try {
    const { name } = await req.json();
    if (!name?.trim()) return jsonError('Give the workspace a name.');
    const { data, error } = await admin().from('sp_workspaces').update({ name: name.trim().slice(0, 80) }).eq('id', params.id).select().single();
    if (error) throw error;
    return Response.json({ workspace: data });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

// Deleting a workspace keeps its songs; they move back to "My Workspace".
export async function DELETE(_req, { params }) {
  try {
    const { error } = await admin().from('sp_workspaces').delete().eq('id', params.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
