// Server-only OAuth helpers for YouTube (Google) and SoundCloud.
import { admin } from '@/lib/supabase-admin';

export const PROVIDERS = {
  youtube: {
    name: 'YouTube',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    pkce: false,
    extraAuthParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    async accountName(token) {
      const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json().catch(() => ({}));
      return d.items?.[0]?.snippet?.title || null;
    },
  },
  soundcloud: {
    name: 'SoundCloud',
    clientId: () => process.env.SOUNDCLOUD_CLIENT_ID,
    clientSecret: () => process.env.SOUNDCLOUD_CLIENT_SECRET,
    authorizeUrl: 'https://secure.soundcloud.com/authorize',
    tokenUrl: 'https://secure.soundcloud.com/oauth/token',
    scope: null,
    pkce: true,
    extraAuthParams: {},
    async accountName(token) {
      const r = await fetch('https://api.soundcloud.com/me', {
        headers: { Authorization: `OAuth ${token}`, Accept: 'application/json; charset=utf-8' },
      });
      const d = await r.json().catch(() => ({}));
      return d.username || d.full_name || null;
    },
  },
};

export function provider(service) {
  const p = PROVIDERS[service];
  if (!p) throw new Error('Unknown service.');
  return p;
}

export function isConfigured(service) {
  const p = provider(service);
  return Boolean(p.clientId() && p.clientSecret());
}

export function redirectUri(req, service) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  return `${base.replace(/\/$/, '')}/api/connect/${service}/callback`;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

export async function getRow(service) {
  const { data } = await admin().from('sp_connections').select('*').eq('service', service).maybeSingle();
  return data || null;
}

export async function saveRow(service, patch) {
  const { error } = await admin()
    .from('sp_connections')
    .upsert({ service, ...patch, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function tokenRequest(service, params) {
  const p = provider(service);
  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: p.clientId(), client_secret: p.clientSecret(), ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Token request failed (${res.status})`);
  return data;
}

export async function exchangeCode(req, service, code, verifier) {
  const params = { grant_type: 'authorization_code', code, redirect_uri: redirectUri(req, service) };
  if (verifier) params.code_verifier = verifier;
  return tokenRequest(service, params);
}

// Returns a valid access token, refreshing it when it is about to expire.
export async function accessToken(service) {
  const row = await getRow(service);
  if (!row?.access_token && !row?.refresh_token) throw new Error(`${provider(service).name} is not connected.`);
  const fresh = row.expires_at && new Date(row.expires_at).getTime() - Date.now() > 120000;
  if (row.access_token && (fresh || !row.refresh_token)) return row.access_token;
  const data = await tokenRequest(service, { grant_type: 'refresh_token', refresh_token: row.refresh_token });
  await saveRow(service, {
    access_token: data.access_token,
    refresh_token: data.refresh_token || row.refresh_token,
    expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
  });
  return data.access_token;
}
