import { provider, exchangeCode, getRow, saveRow } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// GET /api/connect/:service/callback — the platform sends the browser back here
export async function GET(req, { params }) {
  const { service } = params;
  const url = new URL(req.url);
  const back = (q) => Response.redirect(new URL(`/connections?${q}`, req.url), 302);
  try {
    const p = provider(service);
    if (url.searchParams.get('error')) return back(`error=${encodeURIComponent(url.searchParams.get('error'))}`);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code) return back('error=no-code-returned');
    const row = await getRow(service);
    let pending = [];
    try {
      pending = JSON.parse(row?.oauth_state || '[]');
      if (!Array.isArray(pending)) pending = [];
    } catch {}
    const match = pending.find((p) => p && p.state === state && p.at > Date.now() - 30 * 60 * 1000);
    if (!match) return back('error=sign-in-expired');

    const data = await exchangeCode(req, service, code, match.verifier);
    const account = await p.accountName(data.access_token).catch(() => null);
    await saveRow(service, {
      access_token: data.access_token,
      refresh_token: data.refresh_token || row.refresh_token || null,
      expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
      account_name: account,
      oauth_state: null,
      pkce_verifier: null,
    });
    return back(`connected=${service}`);
  } catch (e) {
    return back(`error=${encodeURIComponent(e.message)}`);
  }
}
