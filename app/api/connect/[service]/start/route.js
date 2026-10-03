import { provider, isConfigured, redirectUri, pkcePair, saveRow } from '@/lib/oauth';

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
    await saveRow(service, { oauth_state: state, pkce_verifier: verifier });
    return Response.redirect(`${p.authorizeUrl}?${q.toString()}`, 302);
  } catch (e) {
    return Response.redirect(new URL(`/connections?error=${encodeURIComponent(e.message)}`, req.url), 302);
  }
}
