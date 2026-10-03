import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function DELETE(_req, { params }) {
  try {
    const { error } = await admin().from('sp_comments').delete().eq('id', params.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
