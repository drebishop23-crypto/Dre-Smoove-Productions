import { provider, exchangeCode, getRow, saveRow, checkState, readCookie, redirect } from '@/lib/oauth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/connect/:service/callback — the platform sends the browser back here
export async function GET(req, { params }) {
  const { service } = params;
  const url = new URL(req.url);
  const clearPkce = `sp_pkce_${service}=; Path=/api/connect; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  const back = (q) => redirect(new URL(`/connections?${q}`, req.url).toString(), clearPkce);
  try {
    const p = provider(service);
    if (url.searchParams.get('error')) return back(`error=${encodeURIComponent(url.searchParams.get('error_description') || url.searchParams.get('error'))}`);
    const code = url.searchParams.get('code');
    if (!code) return back('error=no-code-returned');
    if (!(await checkState(service, url.searchParams.get('state')))) return back('error=sign-in-expired');

    const verifier = p.pkce ? readCookie(req, `sp_pkce_${service}`) : null;
    if (p.pkce && !verifier) return back('error=sign-in-expired');

    const data = await exchangeCode(req, service, code, verifier);
    const account = await p.accountName(data.access_token).catch(() => null);
    const row = await getRow(service).catch(() => null);
    await saveRow(service, {
      access_token: data.access_token,
      refresh_token: data.refresh_token || row?.refresh_token || null,
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
