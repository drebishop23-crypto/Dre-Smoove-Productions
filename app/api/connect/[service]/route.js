import { jsonError } from '@/lib/supabase-admin';
import { provider, saveRow } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// DELETE /api/connect/:service — disconnect
export async function DELETE(_req, { params }) {
  try {
    provider(params.service);
    await saveRow(params.service, {
      access_token: null, refresh_token: null, expires_at: null, account_name: null, pkce_verifier: null, oauth_state: null,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}
