import { provider, isConfigured, redirectUri, pkcePair, makeState, redirect } from '@/lib/oauth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/connect/:service/start — send the browser to the platform's sign-in page
export async function GET(req, { params }) {
  const { service } = params;
  try {
    const p = provider(service);
    if (!isConfigured(service)) return redirect(new URL(`/connections?error=${service}-not-configured`, req.url).toString());
    const state = await makeState(service);
    const q = new URLSearchParams({
      client_id: p.clientId(),
      redirect_uri: redirectUri(req, service),
      response_type: 'code',
      state,
      ...p.extraAuthParams,
    });
    if (p.scope) q.set('scope', p.scope);
    let cookie = null;
    if (p.pkce) {
      const pair = await pkcePair();
      q.set('code_challenge', pair.challenge);
      q.set('code_challenge_method', 'S256');
      cookie = `sp_pkce_${service}=${encodeURIComponent(pair.verifier)}; Path=/api/connect; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`;
    }
    return redirect(`${p.authorizeUrl}?${q.toString()}`, cookie);
  } catch (e) {
    return redirect(new URL(`/connections?error=${encodeURIComponent(e.message)}`, req.url).toString());
  }
}
