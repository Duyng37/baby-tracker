import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CloudError, type Transport } from '../sync/engine';
import { parsePage, parseResult, parseWorkspace } from '../sync/protocol';

// Only modern browser-safe publishable keys. Never accept service-role/secret keys.
function configuration() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !key.startsWith('sb_publishable_')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
      || parsed.pathname !== '/' || !parsed.hostname.endsWith('.supabase.co')) return null;
    return { url: parsed.origin, key };
  } catch { return null; }
}

const config = configuration();
export const projectId = config ? new URL(config.url).hostname : 'unconfigured';
export const supabase = config ? createClient(config.url, config.key, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, debug: false },
}) : null;

function failure(code: string | undefined, status: number) {
  if (code === '40001') return new CloudError('retry');
  if (status === 401 || code === '28000' || code === 'PGRST301') return new CloudError('auth');
  if (status === 403 || code === '42501') return new CloudError('forbidden');
  if (code === '22023' || status === 400) return new CloudError('invalid');
  return new CloudError('retry');
}

export class SupabaseTransport implements Transport {
  constructor(readonly userId: string, private readonly client: SupabaseClient) {}
  async rpc(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    const { data, error, status } = await this.client.rpc(name, args).abortSignal(signal);
    // Do not log/propagate raw server errors, payloads, response headers or tokens.
    if (error) throw failure(error.code, status);
    return data;
  }
  async workspace(signal: AbortSignal) { return parseWorkspace(await this.rpc('get_workspace', {}, signal)); }
  async apply(request: Parameters<Transport['apply']>[0], signal: AbortSignal) {
    return parseResult(await this.rpc('apply_event', request, signal));
  }
  async pull(family: string, after: string, signal: AbortSignal) {
    return parsePage(await this.rpc('pull_changes', { p_family_id: family, p_after: after, p_limit: 200 }, signal));
  }
}

export async function authenticatedTransport(userId: string): Promise<SupabaseTransport> {
  if (!supabase || !config) throw new CloudError('auth');
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session || session.user.id !== userId || (session.expires_at ?? 0) * 1000 <= Date.now()) throw new CloudError('auth');
  // Bind the token for this run. A later account switch cannot send A's outbox as B.
  const token = session.access_token;
  const scoped = createClient(config.url, config.key, { accessToken: async () => token });
  return new SupabaseTransport(userId, scoped);
}

export async function signIn() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
    redirectTo: `${window.location.origin}/`, scopes: 'openid email profile',
  } });
  if (error) throw new CloudError('auth');
}