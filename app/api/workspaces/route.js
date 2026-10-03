import { admin, jsonError } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await admin().from('sp_workspaces').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return Response.json({ workspaces: data || [] });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

export async function POST(req) {
  try {
    const { name } = await req.json();
    if (!name?.trim()) return jsonError('Give the workspace a name.');
    const { data, error } = await admin().from('sp_workspaces').insert({ name: name.trim().slice(0, 80) }).select().single();
    if (error) throw error;
    return Response.json({ workspace: data });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
