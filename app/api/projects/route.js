import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await admin().from('sp_projects').select('id, name, data, created_at, updated_at').order('updated_at', { ascending: false });
    if (error) throw error;
    return Response.json({ projects: data || [] });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { data, error } = await admin()
      .from('sp_projects')
      .insert({ name: (body.name || 'Untitled project').slice(0, 120), data: body.data || { tracks: [] } })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ project: data });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
