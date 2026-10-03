import { jsonError } from '@/lib/supabase-admin';
import { PROVIDERS, getRow, isConfigured } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// GET /api/connect — status of every connection
export async function GET() {
  try {
    const out = {};
    for (const service of Object.keys(PROVIDERS)) {
      const row = await getRow(service).catch(() => null);
      out[service] = {
        configured: isConfigured(service),
        connected: Boolean(row?.refresh_token || row?.access_token),
        account: row?.account_name || null,
      };
    }
    return Response.json({ connections: out });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
