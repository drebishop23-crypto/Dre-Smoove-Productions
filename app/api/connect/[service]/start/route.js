import { provider, isConfigured, redirectUri, pkcePair, getRow, saveRow } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// GET /api/connect/:service/start — send the browser to the platform's sign-in page
export async function GET(req, { params }) {
  const { service } = params;
  try {
    const p = provider(service);
    if (!isConfigured(service)) {
      return Response.redirect(new URL(`/connections?error=${service}-not-configured`, req.url), 302);
    }
    const state = crypto.randomUUID();
    const q = new URLSearchParams({
      client_id: p.clientId(),
      redirect_uri: redirectUri(req, service),
      response_type: 'code',
      state,
      ...p.extraAuthParams,
    });
    if (p.scope) q.set('scope', p.scope);
    let verifier = null;
    if (p.pkce) {
      const pair = await pkcePair();
      verifier = pair.verifier;
      q.set('code_challenge', pair.challenge);
      q.set('code_challenge_method', 'S256');
    }
    // Keep the last few sign-in attempts so going back or clicking Connect twice still works
    const row = await getRow(service).catch(() => null);
    let pending = [];
    try {
      pending = JSON.parse(row?.oauth_state || '[]');
      if (!Array.isArray(pending)) pending = [];
    } catch {}
    const cutoff = Date.now() - 30 * 60 * 1000;
    pending = [{ state, verifier, at: Date.now() }, ...pending.filter((p) => p && p.at > cutoff)].slice(0, 5);
    await saveRow(service, { oauth_state: JSON.stringify(pending), pkce_verifier: null });
    return Response.redirect(`${p.authorizeUrl}?${q.toString()}`, 302);
  } catch (e) {
    return Response.redirect(new URL(`/connections?error=${encodeURIComponent(e.message)}`, req.url), 302);
  }
}
