import { createClient } from '@supabase/supabase-js';
import { HttpError, type Config } from './security.ts';

export type Tokens = { access_token: string; refresh_token: string; expires_at: number; user: { id: string } };
export type VaultRow = { user_id: string; encrypted_tokens: string; access_expires_at: string; expires_at: string };
export type Backend = ReturnType<typeof backend>;
export function parseTokens(value: unknown): Tokens {
  const v = value as Partial<Tokens> | null;
  if (!v || typeof v.access_token !== 'string' || !v.access_token || typeof v.refresh_token !== 'string'
    || !v.refresh_token || !Number.isFinite(v.expires_at) || typeof v.user?.id !== 'string') throw new HttpError(503);
  // Do not retain provider tokens, email, profile, or other unnecessary PII in the vault.
  return { access_token: v.access_token, refresh_token: v.refresh_token, expires_at: v.expires_at!, user: { id: v.user.id } };
}
export function backend(config: Config) {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false } };
  const admin = createClient(config.url, config.secret, options);
  async function vault(name: string, args: Record<string, unknown>) {
    const { data, error } = await admin.rpc(name, args).abortSignal(AbortSignal.timeout(8_000));
    if (error) throw new HttpError(503); // Never forward/log raw SDK errors or response bodies.
    return data;
  }
  async function token(grant: 'pkce' | 'refresh_token', body: Record<string, string>): Promise<Tokens> {
    let response: Response;
    try {
      response = await fetch(`${config.url}/auth/v1/token?grant_type=${grant}`, {
        method: 'POST', headers: { apikey: config.publishable, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(8_000), cache: 'no-store', redirect: 'error',
      });
    } catch { throw new HttpError(503); }
    if (!response.ok) {
      if ([400, 401, 403, 422].includes(response.status)) throw new HttpError(401, 'auth');
      throw new HttpError(503);
    }
    const data = await response.json();
    // GoTrue's token endpoint supplies expires_in; SDK normally derives expires_at.
    return parseTokens({ ...data, expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + data.expires_in });
  }
  return {
    async create(hash: string, user: string, encrypted: string, expiry: number) {
      await vault('bff_session_create', { p_hash: hash, p_user: user, p_tokens: encrypted, p_access_expiry: new Date(expiry * 1000).toISOString() });
    },
    async read(hash: string): Promise<VaultRow | null> { return vault('bff_session_read', { p_hash: hash }); },
    async claim(hash: string, owner: string, expected: string): Promise<boolean> {
      return vault('bff_session_claim', { p_hash: hash, p_owner: owner, p_expected_tokens: expected });
    },
    async save(hash: string, owner: string, encrypted: string, expiry: number): Promise<boolean> {
      return vault('bff_session_save', { p_hash: hash, p_owner: owner, p_tokens: encrypted, p_access_expiry: new Date(expiry * 1000).toISOString() });
    },
    async remove(hash: string) { await vault('bff_session_delete', { p_hash: hash }); },
    exchange: (code: string, verifier: string) => token('pkce', { auth_code: code, code_verifier: verifier }),
    refresh: (refresh: string) => token('refresh_token', { refresh_token: refresh }),
    async rpc(access: string, name: string, args: Record<string, unknown>) {
      // NEVER use admin/service-role for family data. Pin this request's user JWT.
      const client = createClient(config.url, config.publishable, { ...options, accessToken: async () => access });
      const { data, error, status } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(20_000));
      if (error) {
        if (status === 401 || ['28000', 'PGRST301'].includes(error.code)) throw new HttpError(401, 'auth');
        if (status === 403 || error.code === '42501') throw new HttpError(403, 'forbidden');
        if (error.code !== '40001' && (status === 400 || error.code === '22023')) throw new HttpError(400, 'invalid');
        throw new HttpError(503);
      }
      return data;
    },
  };
}